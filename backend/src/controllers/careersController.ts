import { Request, Response } from 'express';
import { Transaction, UniqueConstraintError } from 'sequelize';
import { z } from 'zod';
import { Job, ApplicationFormsMaster, ExternalApplicant } from '../models';
import type { CustomFormField } from '../models/Job';
import { asyncHandler } from '../utils/asyncHandler';
import { ApiError } from '../utils/ApiError';
import { runInRequestContext } from '../utils/withRequestContext';
import { loadParsedRequirements, scoreExternalApplication, tierForPercent } from '../utils/relevancyScoring';

/**
 * The public Careers Page — genuinely anonymous, no requireAuth anywhere in
 * this file. getJobBySlug (Phase 5) is data-only; applyToJob (Phase 6) is
 * where a submission actually gets written and scored.
 *
 * Deliberately does NOT include the company's name/branding in
 * getJobBySlug's response — company_profiles has no public-read RLS policy
 * today (every existing policy on it requires a signed-in role), and adding
 * one is a bigger decision than either phase's scope. A future phase can
 * add that once it's actually needed for the public page's design.
 */

interface FormField {
  key: string;
  label: string;
  type: string;
  required: boolean;
  options: string[] | null;
  sortOrder: number;
}

/** Shared by getJobBySlug and applyToJob — resolves a job's form field
 * list from either the preset master table or its own custom schema. */
async function resolveJobFields(job: Job, t: Transaction): Promise<FormField[]> {
  if (job.formType === 'custom') {
    return (job.customFormSchema ?? []).map((f: CustomFormField) => ({
      key: f.key,
      label: f.label,
      type: f.type,
      required: f.required,
      options: f.options ?? null,
      sortOrder: f.sortOrder,
    }));
  }
  if (!job.formType) return [];

  const rows = await ApplicationFormsMaster.findAll({
    where: { formType: job.formType },
    order: [['sortOrder', 'ASC']],
    transaction: t,
  });
  return rows.map((row) => ({
    key: row.fieldKey,
    label: row.fieldLabel,
    type: row.fieldType,
    required: row.isRequired,
    options: row.options,
    sortOrder: row.sortOrder,
  }));
}

export const getJobBySlug = asyncHandler(async (req: Request, res: Response) => {
  const { slug } = req.params;

  const response = await runInRequestContext(null, async (t) => {
    const job = await Job.findOne({ where: { careersLinkSlug: slug }, transaction: t });
    if (!job) throw ApiError.notFound('Job not found');

    // A job can have a slug but no form type yet, if generateCareersLink
    // was somehow interrupted between saving the slug and the form choice
    // — shouldn't happen in the normal flow (both are set in one request),
    // but treated as "not ready to accept applications" rather than a 500.
    const fields = await resolveJobFields(job, t);

    return {
      jobId: job.id,
      title: job.title,
      description: job.description,
      status: job.status,
      formType: job.formType,
      fields,
    };
  });

  res.json(response);
});

// ---------------------------------------------------------------------
// POST /careers/:slug/apply (Feature 2, Phase 6)
// ---------------------------------------------------------------------

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Every field arrives as a plain scalar — the form fields this validates
// against (text/textarea/number/select/checkbox/date) never produce nested
// objects/arrays client-side.
const applyToJobSchema = z.record(z.string(), z.union([z.string(), z.number(), z.boolean()]));

export const applyToJob = asyncHandler(async (req: Request, res: Response) => {
  const { slug } = req.params;
  const rawBody = applyToJobSchema.parse(req.body);

  const result = await runInRequestContext(null, async (t) => {
    const job = await Job.findOne({ where: { careersLinkSlug: slug }, transaction: t });
    if (!job) throw ApiError.notFound('Job not found');
    if (job.status === 'closed') {
      throw ApiError.badRequest('This job is no longer accepting applications');
    }
    if (!job.formType) {
      throw ApiError.badRequest('This job is not yet accepting applications');
    }

    const fields = await resolveJobFields(job, t);

    // Keep only submitted values for fields the form actually declares
    // (never trust the raw body's shape beyond that), and collect missing
    // required fields.
    const formData: Record<string, unknown> = {};
    const missingLabels: string[] = [];
    for (const field of fields) {
      const value = rawBody[field.key];
      const isEmpty = value === undefined || value === null || (typeof value === 'string' && value.trim() === '');
      if (field.required && isEmpty) missingLabels.push(field.label);
      if (!isEmpty) formData[field.key] = value;
    }
    if (missingLabels.length > 0) {
      throw ApiError.badRequest(`Missing required field(s): ${missingLabels.join(', ')}`);
    }

    // email is load-bearing (conversion matching, the only way a company
    // can contact an applicant) — validated unconditionally, regardless of
    // whether the form itself marked it required. See
    // migrations/20240122000001's header comment.
    const emailRaw = typeof formData.email === 'string' ? formData.email.trim().toLowerCase() : '';
    if (!EMAIL_PATTERN.test(emailRaw)) {
      throw ApiError.badRequest('A valid email address is required');
    }
    const fullName = typeof formData.full_name === 'string' ? formData.full_name.trim() || null : null;

    // Scored against whatever the job's parsed requirements are right now.
    // Null if the job never had a JD parsed successfully — "without
    // required structured fields, an external application can't be placed
    // into a relevancy batch" (spec), generalized to the job's own side of
    // that same requirement.
    const requirements = await loadParsedRequirements(job.id, t);
    const relevancyPercent = requirements ? scoreExternalApplication(requirements, formData) : null;
    const tier = relevancyPercent !== null ? tierForPercent(relevancyPercent) : null;

    let created: ExternalApplicant;
    try {
      created = await ExternalApplicant.create(
        { jobId: job.id, formData, fullName, email: emailRaw, relevancyPercent, tier },
        { transaction: t },
      );
    } catch (err) {
      if (err instanceof UniqueConstraintError) {
        throw ApiError.conflict("You've already applied to this job");
      }
      throw err;
    }

    return { applicationId: created.id, appliedAt: created.appliedAt };
  });

  res.status(201).json(result);
});
