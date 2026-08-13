import crypto from 'crypto';
import { Request, Response } from 'express';
import { z } from 'zod';
import {
  CandidateEducation,
  CandidateProfile,
  CandidateVerificationDocument,
  User,
} from '../models';
import type { ExtractedDocumentFields } from '../models/CandidateVerificationDocument';
import { env } from '../config/env';
import { asyncHandler } from '../utils/asyncHandler';
import { ApiError } from '../utils/ApiError';
import { runInRequestContext } from '../utils/withRequestContext';
import { DocumentReadError, readDocument } from '../utils/documentReader';
import {
  matchExtractedToClaim,
  parseAadhaar,
  parseMarksCard,
  type ClaimedFields,
} from '../utils/documentParsers';
import {
  buildAuthorizeUrl,
  createPkcePair,
  exchangeCodeForToken,
  isDigilockerConfigured,
  assertDigilockerConfigured,
  tokenToExtractedFields,
} from '../utils/digilocker';

/**
 * Automated verification of the two things that previously always needed a
 * human: who the candidate is, and what they studied.
 *
 * The shape of the answer matters more than the automation. A document check
 * has three outcomes, not two:
 *
 *   auto_verified  the document says what the candidate says. Nobody needs to
 *                  look at this.
 *   manual_review  the document was readable but did not confirm enough. This
 *                  is the normal outcome for a bad photo, and it goes into the
 *                  verifier's existing queue exactly as it would have before.
 *   failed         the document could not be read or actively contradicts the
 *                  claim.
 *
 * Collapsing the middle case into `failed` is the obvious mistake here and the
 * one this is written to avoid: OCR on a phone photo of a laminated marks card
 * is not reliable enough to turn an honest candidate away, so it is only ever
 * allowed to *save* a verifier work, never to reject on its own.
 */

const submitSchema = z
  .object({
    docType: z.enum(['aadhaar', 'marks_card', 'degree_certificate']),
    documentLink: z.string().url('Enter a full link, starting with https://').max(500),
    /** Required for a marks card — it says which qualification this proves. */
    educationId: z.string().uuid().optional(),
  })
  .superRefine((value, ctx) => {
    if (value.docType !== 'aadhaar' && !value.educationId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['educationId'],
        message: 'Choose which education entry this document is for',
      });
    }
  });

/**
 * Public shape. Note what is absent: `extracted.rawTextSample` is stripped
 * before anything leaves the server. It exists so a verifier can see why a
 * match failed, and a candidate replaying their own OCR text back at them
 * only helps them tune a forgery against the matcher.
 */
function toResponse(row: CandidateVerificationDocument) {
  const extracted = row.extracted ? { ...row.extracted } : null;
  if (extracted) delete extracted.rawTextSample;

  return {
    id: row.id,
    docType: row.docType,
    source: row.source,
    documentLink: row.documentLink,
    educationId: row.educationId,
    status: row.status,
    extracted,
    fieldMatches: row.fieldMatches,
    confidence: row.confidence,
    aadhaarLast4: row.aadhaarLast4,
    failureReason: row.failureReason,
    processedAt: row.processedAt,
    createdAt: row.createdAt,
  };
}

export const listMyDocuments = asyncHandler(async (req: Request, res: Response) => {
  const authUser = req.user!;

  const rows = await runInRequestContext(authUser, (t) =>
    CandidateVerificationDocument.findAll({
      where: { candidateId: authUser.id },
      order: [['createdAt', 'DESC']],
      transaction: t,
    }),
  );

  res.json(rows.map(toResponse));
});

/**
 * What the candidate has claimed, for whichever thing this document backs.
 *
 * An Aadhaar is checked against the profile's own name; a marks card against
 * one education row. Both are read inside the caller's transaction so the
 * comparison is against the same data the rest of the request sees.
 */
async function loadClaim(
  docType: 'aadhaar' | 'marks_card' | 'degree_certificate',
  candidateId: string,
  educationId: string | undefined,
  transaction: Parameters<typeof CandidateEducation.findOne>[0] extends { transaction?: infer T }
    ? T
    : never,
): Promise<{ claimed: ClaimedFields; education: CandidateEducation | null }> {
  if (docType === 'aadhaar') {
    const user = await User.findByPk(candidateId, { transaction });
    return { claimed: { fullName: user?.fullName ?? null }, education: null };
  }

  const education = await CandidateEducation.findOne({
    where: { id: educationId, candidateId },
    transaction,
  });
  if (!education) throw ApiError.notFound('That education entry no longer exists.');

  const user = await User.findByPk(candidateId, { transaction });

  return {
    claimed: {
      fullName: user?.fullName ?? null,
      institution: education.institution,
      boardOrUniversity: education.boardOrUniversity,
      passingYear: education.endYear,
      scoreValue: education.scoreValue,
      scoreType: education.scoreType,
    },
    education,
  };
}

export const submitDocument = asyncHandler(async (req: Request, res: Response) => {
  const authUser = req.user!;
  const body = submitSchema.parse(req.body);

  // The claim is loaded, and the row created, in one short transaction. The
  // network fetch and the OCR that follow are deliberately OUTSIDE it: reading
  // a 12 MB scan takes seconds, and holding a Postgres transaction (and, with
  // it, one of a small pool of Supabase connections) open across a third-party
  // fetch is how a handful of concurrent uploads take the whole API down.
  const { rowId, claimed } = await runInRequestContext(authUser, async (t) => {
    const profile = await CandidateProfile.findOne({
      where: { userId: authUser.id },
      transaction: t,
    });
    if (!profile) throw ApiError.notFound('Build your profile before verifying documents.');

    const { claimed: claim } = await loadClaim(
      body.docType,
      authUser.id,
      body.educationId,
      t as never,
    );

    if (!claim.fullName) {
      throw ApiError.badRequest(
        'Add your full name to your profile first — that is what the document is checked against.',
      );
    }

    // One live check per document slot. Re-submitting replaces the previous
    // attempt rather than stacking, so a candidate fixing a bad photo doesn't
    // leave a trail of failures behind them for a verifier to wade through.
    await CandidateVerificationDocument.destroy({
      where: {
        candidateId: authUser.id,
        docType: body.docType,
        ...(body.educationId ? { educationId: body.educationId } : {}),
      },
      transaction: t,
    });

    const created = await CandidateVerificationDocument.create(
      {
        candidateId: authUser.id,
        docType: body.docType,
        source: 'drive_link',
        documentLink: body.documentLink,
        educationId: body.educationId ?? null,
        status: 'processing',
      },
      { transaction: t },
    );

    return { rowId: created.id, claimed: claim };
  });

  // ----- Outside the transaction: fetch, read, parse, match -----
  let extracted: ExtractedDocumentFields | null = null;
  let readConfidence = 0;
  let readFailure: string | null = null;

  try {
    const read = await readDocument(body.documentLink);
    readConfidence = read.readConfidence;
    extracted =
      body.docType === 'aadhaar' ? parseAadhaar(read.text) : parseMarksCard(read.text);
  } catch (err) {
    // DocumentReadError messages are written for the candidate and describe
    // something they can fix. Anything else is ours, and is logged rather
    // than shown.
    if (err instanceof DocumentReadError) {
      readFailure = err.message;
    } else {
      console.error('[verification] unexpected read failure', err);
      readFailure = 'We could not read that document. Please try a different file.';
    }
  }

  const outcome = extracted ? matchExtractedToClaim(extracted, claimed) : null;

  // The reader's confidence in the characters and the matcher's confidence in
  // the agreement are multiplied, not averaged: a perfect match derived from
  // text the reader was unsure of is not strong evidence, and averaging would
  // let one high number carry the other over the line.
  const combinedConfidence = outcome ? outcome.confidence * Math.max(readConfidence, 0.5) : 0;

  let status: 'auto_verified' | 'manual_review' | 'failed';
  let failureReason: string | null = readFailure;

  if (readFailure) {
    status = 'failed';
  } else if (outcome && Object.keys(outcome.fieldMatches).length === 0) {
    // Readable, but nothing in it lined up with anything checkable. Not the
    // candidate's fault and not evidence against them.
    status = 'manual_review';
    failureReason = 'We read the document but could not find fields to check. A reviewer will look.';
  } else if (outcome && combinedConfidence >= env.AUTO_VERIFY_THRESHOLD && outcome.mismatched.length === 0) {
    status = 'auto_verified';
  } else {
    status = 'manual_review';
    failureReason =
      outcome && outcome.mismatched.length > 0
        ? `A reviewer will check this — the document did not clearly confirm: ${outcome.mismatched.join(', ')}.`
        : 'A reviewer will check this document.';
  }

  const saved = await runInRequestContext(authUser, async (t) => {
    const row = await CandidateVerificationDocument.findOne({
      where: { id: rowId, candidateId: authUser.id },
      transaction: t,
    });
    // Gone means the candidate deleted the education entry mid-read; there is
    // nothing to record against.
    if (!row) throw ApiError.notFound('That verification was cancelled.');

    row.status = status;
    row.extracted = extracted;
    row.fieldMatches = outcome?.fieldMatches ?? null;
    row.confidence = outcome ? Number(combinedConfidence.toFixed(3)) : null;
    row.aadhaarLast4 = extracted?.aadhaarLast4 ?? null;
    row.failureReason = failureReason;
    row.processedAt = new Date();
    row.updatedAt = new Date();
    await row.save({ transaction: t });

    // A clean marks-card match moves the education row to `auto_verified`,
    // which is what actually saves the verifier the work. Note it never moves
    // it to `rejected`: a machine may promote a claim, never bury one.
    if (status === 'auto_verified' && row.educationId) {
      const education = await CandidateEducation.findOne({
        where: { id: row.educationId, candidateId: authUser.id },
        transaction: t,
      });
      if (education && education.verificationStatus === 'pending') {
        education.verificationStatus = 'auto_verified';
        education.updatedAt = new Date();
        await education.save({ transaction: t });
      }
    }

    return row;
  });

  res.status(201).json(toResponse(saved));
});

export const removeDocument = asyncHandler(async (req: Request, res: Response) => {
  const authUser = req.user!;
  const { id } = req.params;

  await runInRequestContext(authUser, async (t) => {
    const row = await CandidateVerificationDocument.findOne({
      where: { id, candidateId: authUser.id },
      transaction: t,
    });
    if (!row) throw ApiError.notFound('Verification not found');

    // Withdrawing the proof withdraws what it proved. Leaving the education
    // row sitting at `auto_verified` with nothing behind it is the one way
    // this feature could be used to launder an unverified claim.
    if (row.educationId) {
      const education = await CandidateEducation.findOne({
        where: { id: row.educationId, candidateId: authUser.id },
        transaction: t,
      });
      if (education && education.verificationStatus === 'auto_verified') {
        education.verificationStatus = 'pending';
        education.updatedAt = new Date();
        await education.save({ transaction: t });
      }
    }

    await row.destroy({ transaction: t });
  });

  res.status(204).send();
});

// ---------------------------------------------------------------------------
// DigiLocker
// ---------------------------------------------------------------------------

/**
 * PKCE verifiers, held between the authorize redirect and the callback.
 *
 * In memory, and therefore single-instance: a deployment running two API
 * processes behind a load balancer would see a callback land on the process
 * that did not start the flow. That is acceptable *for now* only because
 * this whole path is dormant until DigiLocker credentials exist (see
 * utils/digilocker.ts) — turning it on for real means moving this to the
 * database or a shared cache first, and there is a check in digilockerStart
 * that will not let it be enabled silently without someone reading this.
 */
const pendingFlows = new Map<string, { verifier: string; candidateId: string; at: number }>();
const FLOW_TTL_MS = 10 * 60 * 1000;

function reapExpiredFlows(): void {
  const cutoff = Date.now() - FLOW_TTL_MS;
  for (const [state, flow] of pendingFlows) {
    if (flow.at < cutoff) pendingFlows.delete(state);
  }
}

export const digilockerStatus = asyncHandler(async (_req: Request, res: Response) => {
  res.json({
    configured: isDigilockerConfigured(),
    // The frontend renders the OCR path as the primary route when this is
    // false, rather than showing a button that always errors.
    message: isDigilockerConfigured()
      ? 'Verify instantly with DigiLocker.'
      : 'DigiLocker verification is coming soon. For now, link your document and we will check it automatically.',
  });
});

export const digilockerStart = asyncHandler(async (req: Request, res: Response) => {
  assertDigilockerConfigured();
  reapExpiredFlows();

  const authUser = req.user!;
  const state = crypto.randomBytes(24).toString('base64url');
  const { verifier, challenge } = createPkcePair();

  pendingFlows.set(state, { verifier, candidateId: authUser.id, at: Date.now() });

  res.json({ authorizeUrl: buildAuthorizeUrl(state, challenge), state });
});

const callbackSchema = z.object({
  code: z.string().min(1),
  state: z.string().min(1),
});

export const digilockerCallback = asyncHandler(async (req: Request, res: Response) => {
  assertDigilockerConfigured();
  const authUser = req.user!;
  const body = callbackSchema.parse(req.body);

  reapExpiredFlows();
  const flow = pendingFlows.get(body.state);
  // Consumed on sight, valid once: an authorization code replayed against a
  // still-live state is the thing `state` exists to stop.
  pendingFlows.delete(body.state);

  if (!flow || flow.candidateId !== authUser.id) {
    throw ApiError.badRequest('That DigiLocker session has expired. Please start again.');
  }

  const token = await exchangeCodeForToken(body.code, flow.verifier);
  const extracted = tokenToExtractedFields(token);

  const saved = await runInRequestContext(authUser, async (t) => {
    const user = await User.findByPk(authUser.id, { transaction: t });
    const claimed: ClaimedFields = { fullName: user?.fullName ?? null };
    const outcome = matchExtractedToClaim(extracted, claimed);

    await CandidateVerificationDocument.destroy({
      where: { candidateId: authUser.id, docType: 'aadhaar' },
      transaction: t,
    });

    return CandidateVerificationDocument.create(
      {
        candidateId: authUser.id,
        docType: 'aadhaar',
        source: 'digilocker',
        documentLink: null,
        // An issuer-signed identity needs no confidence discount — unlike the
        // OCR path there is nothing being guessed. It still has to match the
        // name on the profile, which is what `outcome` decides.
        status: outcome.mismatched.length === 0 ? 'auto_verified' : 'manual_review',
        extracted,
        fieldMatches: outcome.fieldMatches,
        confidence: outcome.mismatched.length === 0 ? 1 : outcome.confidence,
        failureReason:
          outcome.mismatched.length === 0
            ? null
            : `The name on your DigiLocker account does not match your profile name. A reviewer will check this.`,
        processedAt: new Date(),
      },
      { transaction: t },
    );
  });

  res.status(201).json(toResponse(saved));
});
