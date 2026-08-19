import crypto from 'crypto';
import { Request, Response } from 'express';
import { UniqueConstraintError } from 'sequelize';
import { z } from 'zod';
import { Job, JobRequirementParsed, SiteSetting } from '../models';
import type { ApplicationFormType, CustomFormField, JobStatus } from '../models/Job';
import { asyncHandler } from '../utils/asyncHandler';
import { ApiError } from '../utils/ApiError';
import { runInRequestContext } from '../utils/withRequestContext';
import { isGroqConfigured, parseJobDescription } from '../utils/groq';
import { recomputeScoresForJob, type RecomputeResult } from '../utils/relevancyScoring';
import { env } from '../config/env';

/**
 * AI Relevancy Packages (Feature 1) — Phase 1: job creation + Groq-triggered
 * JD parsing. Scoring/batching against candidates is Phase 2, package
 * purchase is Phase 3 — this controller only creates a job and produces its
 * structured job_requirements_parsed row.
 *
 * The Groq call runs OUTSIDE any Postgres transaction, same pattern as
 * verificationController's readDocument() call: a third-party HTTP call can
 * take seconds, and holding a transaction (and a pooled Supabase connection)
 * open across that is how a handful of concurrent requests takes the API
 * down. Each handler below is therefore: short transaction to load
 * prerequisites -> untransacted external call -> short transaction to save
 * the result.
 */

interface JobResponse {
  id: string;
  companyId: string;
  title: string;
  description: string | null;
  customJobId: string | null;
  status: JobStatus;
  careersLinkSlug: string | null;
  /** Derived, not stored — `${FRONTEND_URL}/careers/${slug}`, null until a
   * careers link has been generated. */
  careersUrl: string | null;
  formType: ApplicationFormType | null;
  customFormSchema: CustomFormField[] | null;
  closedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  requirementsParsed: {
    parseStatus: string;
    parseError: string | null;
    extractedSkills: string[];
    extractedRole: string | null;
    extractedExperienceLevel: number | null;
    extractedDomain: string | null;
  } | null;
  /** Non-null only when a (re)parse just triggered a scoring pass this
   * request — Phase 2's recomputeScoresForJob result, surfaced so the
   * company can see "N of M eligible candidates scored" rather than the
   * recompute being an invisible side effect. */
  relevancyRecompute: RecomputeResult | null;
}

function toJobResponse(
  job: Job,
  parsed: JobRequirementParsed | null,
  relevancyRecompute: RecomputeResult | null = null,
): JobResponse {
  return {
    id: job.id,
    companyId: job.companyId,
    title: job.title,
    description: job.description,
    customJobId: job.customJobId,
    status: job.status,
    careersLinkSlug: job.careersLinkSlug,
    careersUrl: job.careersLinkSlug ? `${env.FRONTEND_URL}/careers/${job.careersLinkSlug}` : null,
    formType: job.formType,
    customFormSchema: job.customFormSchema,
    closedAt: job.closedAt,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    requirementsParsed: parsed
      ? {
          parseStatus: parsed.parseStatus,
          parseError: parsed.parseError,
          extractedSkills: parsed.extractedSkills,
          extractedRole: parsed.extractedRole,
          extractedExperienceLevel: parsed.extractedExperienceLevel,
          extractedDomain: parsed.extractedDomain,
        }
      : null,
    relevancyRecompute,
  };
}

/**
 * Runs the Groq extraction (if configured) and returns the outcome shape
 * that gets written to job_requirements_parsed. Never throws — Groq/parse
 * failures are captured as a 'failed' status so a flaky JD-parsing call
 * never fails job creation/editing itself.
 */
async function runParse(
  promptTemplate: string | null,
  title: string,
  description: string,
): Promise<{
  parseStatus: 'success' | 'failed' | 'unavailable';
  parseError: string | null;
  extractedSkills: string[];
  extractedRole: string | null;
  extractedExperienceLevel: number | null;
  extractedDomain: string | null;
}> {
  if (!isGroqConfigured()) {
    return {
      parseStatus: 'unavailable',
      parseError: null,
      extractedSkills: [],
      extractedRole: null,
      extractedExperienceLevel: null,
      extractedDomain: null,
    };
  }

  if (!promptTemplate) {
    return {
      parseStatus: 'failed',
      parseError: 'jd_parsing_prompt_template is not configured in site settings',
      extractedSkills: [],
      extractedRole: null,
      extractedExperienceLevel: null,
      extractedDomain: null,
    };
  }

  try {
    const parsed = await parseJobDescription(promptTemplate, title, description);
    return {
      parseStatus: 'success',
      parseError: null,
      extractedSkills: parsed.requiredSkills,
      extractedRole: parsed.role,
      extractedExperienceLevel:
        parsed.minimumExperienceYears !== null ? Math.round(parsed.minimumExperienceYears) : null,
      extractedDomain: parsed.domain,
    };
  } catch (err) {
    return {
      parseStatus: 'failed',
      parseError: (err instanceof Error ? err.message : 'Unknown error').slice(0, 500),
      extractedSkills: [],
      extractedRole: null,
      extractedExperienceLevel: null,
      extractedDomain: null,
    };
  }
}

// ---------------------------------------------------------------------
// POST /companies/jobs
// ---------------------------------------------------------------------

const createJobSchema = z.object({
  title: z.string().trim().min(1),
  description: z.string().trim().min(1).optional(),
  /** The company's own external tracking id (their ATS/HRIS job id) — see
   * the header comment on migrations/20240121000001 for why this is
   * optional and only unique per company. */
  customJobId: z.string().trim().min(1).optional(),
});

export const createJob = asyncHandler(async (req: Request, res: Response) => {
  const authUser = req.user!;
  const body = createJobSchema.parse(req.body);

  const { job, promptTemplate } = await runInRequestContext(authUser, async (t) => {
    let created: Job;
    try {
      created = await Job.create(
        {
          companyId: authUser.id,
          title: body.title,
          description: body.description ?? null,
          customJobId: body.customJobId ?? null,
        },
        { transaction: t },
      );
    } catch (err) {
      if (err instanceof UniqueConstraintError) {
        throw ApiError.conflict('You already have a job with this custom job ID');
      }
      throw err;
    }
    let prompt: string | null = null;
    if (body.description) {
      const promptRow = await SiteSetting.findByPk('jd_parsing_prompt_template', { transaction: t });
      prompt = promptRow?.value ?? null;
    }
    return { job: created, promptTemplate: prompt };
  });

  let requirementsParsed: JobRequirementParsed | null = null;
  let relevancyRecompute: RecomputeResult | null = null;
  if (body.description) {
    const outcome = await runParse(promptTemplate, body.title, body.description);
    requirementsParsed = await runInRequestContext(authUser, (t) =>
      JobRequirementParsed.create({ jobId: job.id, ...outcome }, { transaction: t }),
    );
    if (outcome.parseStatus === 'success') {
      relevancyRecompute = await runInRequestContext(authUser, (t) => recomputeScoresForJob(job.id, t));
    }
  }

  res.status(201).json(toJobResponse(job, requirementsParsed, relevancyRecompute));
});

// ---------------------------------------------------------------------
// GET /companies/jobs
// ---------------------------------------------------------------------

export const listMyJobs = asyncHandler(async (req: Request, res: Response) => {
  const authUser = req.user!;

  const rows = await runInRequestContext(authUser, (t) =>
    Job.findAll({
      where: { companyId: authUser.id },
      include: [{ model: JobRequirementParsed, as: 'requirementsParsed' }],
      order: [['createdAt', 'DESC']],
      transaction: t,
    }),
  );

  res.json(
    rows.map((row) => {
      const plain = row.get({ plain: true }) as Job & { requirementsParsed: JobRequirementParsed | null };
      return toJobResponse(row, plain.requirementsParsed);
    }),
  );
});

// ---------------------------------------------------------------------
// GET /companies/jobs/:jobId
// ---------------------------------------------------------------------

export const getJob = asyncHandler(async (req: Request, res: Response) => {
  const authUser = req.user!;
  const { jobId } = req.params;

  const response = await runInRequestContext(authUser, async (t) => {
    const job = await Job.findOne({
      where: { id: jobId, companyId: authUser.id },
      include: [{ model: JobRequirementParsed, as: 'requirementsParsed' }],
      transaction: t,
    });
    if (!job) throw ApiError.notFound('Job not found');
    const plain = job.get({ plain: true }) as Job & { requirementsParsed: JobRequirementParsed | null };
    return toJobResponse(job, plain.requirementsParsed);
  });

  res.json(response);
});

// ---------------------------------------------------------------------
// PUT /companies/jobs/:jobId — editing the title/description re-triggers
// parsing, per spec ("recomputed when the JD is edited").
// ---------------------------------------------------------------------

const updateJobSchema = z.object({
  title: z.string().trim().min(1).optional(),
  description: z.string().trim().min(1).optional(),
});

export const updateJob = asyncHandler(async (req: Request, res: Response) => {
  const authUser = req.user!;
  const { jobId } = req.params;
  const body = updateJobSchema.parse(req.body);

  const { job, promptTemplate, shouldParse, effectiveTitle, effectiveDescription } =
    await runInRequestContext(authUser, async (t) => {
      const existing = await Job.findOne({ where: { id: jobId, companyId: authUser.id }, transaction: t });
      if (!existing) throw ApiError.notFound('Job not found');

      if (body.title !== undefined) existing.title = body.title;
      if (body.description !== undefined) existing.description = body.description;
      existing.updatedAt = new Date();
      await existing.save({ transaction: t });

      const willParse = Boolean(existing.description);
      let prompt: string | null = null;
      if (willParse) {
        const promptRow = await SiteSetting.findByPk('jd_parsing_prompt_template', { transaction: t });
        prompt = promptRow?.value ?? null;
      }

      return {
        job: existing,
        promptTemplate: prompt,
        shouldParse: willParse,
        effectiveTitle: existing.title,
        effectiveDescription: existing.description,
      };
    });

  let requirementsParsed: JobRequirementParsed | null = null;
  let relevancyRecompute: RecomputeResult | null = null;
  if (shouldParse && effectiveDescription) {
    const outcome = await runParse(promptTemplate, effectiveTitle, effectiveDescription);
    requirementsParsed = await runInRequestContext(authUser, async (t) => {
      const [row] = await JobRequirementParsed.findOrCreate({
        where: { jobId: job.id },
        defaults: { jobId: job.id, ...outcome },
        transaction: t,
      });
      Object.assign(row, outcome);
      await row.save({ transaction: t });
      return row;
    });
    if (outcome.parseStatus === 'success') {
      relevancyRecompute = await runInRequestContext(authUser, (t) => recomputeScoresForJob(job.id, t));
    }
  }

  res.json(toJobResponse(job, requirementsParsed, relevancyRecompute));
});

// ---------------------------------------------------------------------
// POST /companies/jobs/:jobId/careers-link (Feature 2, Phase 5)
//
// A separate action from job creation — the spec has the company choose
// the application form type "when generating the Careers Page link", which
// reads as a distinct step, not something decided at job-creation time.
// Calling this again on a job that already has a slug regenerates the form
// choice but keeps the existing slug (a previously shared link must keep
// working — reissuing it on every edit would break bookmarks/embeds).
// ---------------------------------------------------------------------

const customFormFieldSchema = z.object({
  key: z.string().trim().min(1),
  label: z.string().trim().min(1),
  type: z.enum(['text', 'textarea', 'number', 'select', 'checkbox', 'date']),
  required: z.boolean(),
  options: z.array(z.string()).optional(),
  sortOrder: z.number().int(),
});

const generateCareersLinkSchema = z
  .object({
    formType: z.enum(['simple', 'detailed', 'foreign', 'custom']),
    customFormSchema: z.array(customFormFieldSchema).optional(),
  })
  .refine((v) => v.formType !== 'custom' || (v.customFormSchema && v.customFormSchema.length > 0), {
    message: 'customFormSchema is required and must be non-empty when formType is custom',
    path: ['customFormSchema'],
  })
  // Phase 6 (external applications) matches converted_candidate_id by
  // email and needs a display name — both denormalized straight off the
  // submission (see migrations/20240122000001's header comment). A preset
  // form always has these keys (seeded); a custom one is a company-defined
  // field set, so this is the one constraint enforced on it rather than
  // letting a company build a form an applicant could submit with no way
  // to be contacted or converted.
  .refine(
    (v) =>
      v.formType !== 'custom' ||
      (v.customFormSchema?.some((f) => f.key === 'email') && v.customFormSchema?.some((f) => f.key === 'full_name')),
    {
      message: "A custom form must include fields keyed 'email' and 'full_name'",
      path: ['customFormSchema'],
    },
  );

function generateSlug(): string {
  return crypto.randomBytes(8).toString('base64url');
}

export const generateCareersLink = asyncHandler(async (req: Request, res: Response) => {
  const authUser = req.user!;
  const { jobId } = req.params;
  const body = generateCareersLinkSchema.parse(req.body);

  const job = await runInRequestContext(authUser, async (t) => {
    const existing = await Job.findOne({ where: { id: jobId, companyId: authUser.id }, transaction: t });
    if (!existing) throw ApiError.notFound('Job not found');

    existing.formType = body.formType;
    existing.customFormSchema = body.formType === 'custom' ? body.customFormSchema ?? [] : null;

    if (!existing.careersLinkSlug) {
      // Extremely low collision odds (8 random bytes) but the unique
      // constraint is the real guarantee — retry a couple of times on a
      // hit rather than trusting probability alone.
      let lastErr: unknown;
      for (let attempt = 0; attempt < 3; attempt += 1) {
        existing.careersLinkSlug = generateSlug();
        try {
          await existing.save({ transaction: t });
          lastErr = null;
          break;
        } catch (err) {
          if (!(err instanceof UniqueConstraintError)) throw err;
          lastErr = err;
        }
      }
      if (lastErr) throw ApiError.serviceUnavailable('Could not generate a unique careers link — try again');
    } else {
      existing.updatedAt = new Date();
      await existing.save({ transaction: t });
    }

    return existing;
  });

  res.json(toJobResponse(job, null));
});

// ---------------------------------------------------------------------
// POST /companies/jobs/:jobId/close, POST /companies/jobs/:jobId/reopen
// ---------------------------------------------------------------------

export const closeJob = asyncHandler(async (req: Request, res: Response) => {
  const authUser = req.user!;
  const { jobId } = req.params;

  const job = await runInRequestContext(authUser, async (t) => {
    const existing = await Job.findOne({ where: { id: jobId, companyId: authUser.id }, transaction: t });
    if (!existing) throw ApiError.notFound('Job not found');
    existing.status = 'closed';
    existing.closedAt = new Date();
    existing.updatedAt = new Date();
    await existing.save({ transaction: t });
    return existing;
  });

  res.json(toJobResponse(job, null));
});

export const reopenJob = asyncHandler(async (req: Request, res: Response) => {
  const authUser = req.user!;
  const { jobId } = req.params;

  const job = await runInRequestContext(authUser, async (t) => {
    const existing = await Job.findOne({ where: { id: jobId, companyId: authUser.id }, transaction: t });
    if (!existing) throw ApiError.notFound('Job not found');
    existing.status = 'open';
    existing.closedAt = null;
    existing.updatedAt = new Date();
    await existing.save({ transaction: t });
    return existing;
  });

  res.json(toJobResponse(job, null));
});
