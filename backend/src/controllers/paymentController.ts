import { Request, Response } from 'express';
import { Transaction } from 'sequelize';
import { z } from 'zod';
import {
  Payment,
  PlanMaster,
  CompanyProfile,
  CandidateProfile,
  SiteSetting,
  Notification,
  User,
  Job,
  CandidateRelevancyScore,
  RelevancyPackage,
  RelevancyPackagePriceBand,
} from '../models';
import type { PaymentType, PaymentMetadata } from '../models/Payment';
import type { RelevancyTier } from '../models/CandidateRelevancyScore';
import { asyncHandler } from '../utils/asyncHandler';
import { ApiError } from '../utils/ApiError';
import { runInRequestContext, RequestContextUser } from '../utils/withRequestContext';
import { env } from '../config/env';
import { isRazorpayConfigured, getRazorpayClient, verifyWebhookSignature } from '../utils/razorpay';
import { sendEmail } from '../utils/email';
import { paymentReceiptEmail, paymentFailedEmail } from '../utils/emailTemplates';

// ---------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------

/** Every list endpoint below defaults to 20/page, capped at 50 — same
 * convention as adminController.parsePagination. */
function parsePagination(page?: number, limit?: number): { page: number; limit: number } {
  const resolvedPage = page && page > 0 ? page : 1;
  const resolvedLimit = Math.min(limit && limit > 0 ? limit : 20, 50);
  return { page: resolvedPage, limit: resolvedLimit };
}

const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).optional(),
});

/**
 * Reads a numeric site_settings value, falling back (with a logged warning,
 * not a crash) if the row is missing or non-numeric — per spec, a missing
 * pricing row must never take down the checkout endpoints.
 */
async function getSiteSettingNumber(
  key: string,
  fallback: number,
  authUser: RequestContextUser,
): Promise<number> {
  const row = await runInRequestContext(authUser, (t) => SiteSetting.findOne({ where: { key }, transaction: t }));
  if (!row?.value) {
    console.warn(`site_settings row "${key}" is missing — falling back to ${fallback}`);
    return fallback;
  }
  const parsed = Number(row.value);
  if (!Number.isFinite(parsed)) {
    console.warn(`site_settings row "${key}" has a non-numeric value "${row.value}" — falling back to ${fallback}`);
    return fallback;
  }
  return parsed;
}

/** Razorpay receipts are capped at 40 chars — short type code + first 8
 * chars of the user id + a millisecond timestamp keeps this well under
 * that while staying unique per request. */
const RECEIPT_TYPE_CODES: Record<PaymentType, string> = {
  subscription: 'sub',
  pay_per_unlock: 'unlk',
  boost: 'bst',
  relevancy_package: 'rlvp',
};
function buildReceipt(type: PaymentType, userId: string): string {
  return `hp_${RECEIPT_TYPE_CODES[type]}_${userId.slice(0, 8)}_${Date.now()}`;
}

/** manualReference's equivalent of buildReceipt above — same shape, "upi"
 * prefix instead of "hp" so the two are visually distinguishable in the
 * admin ledger even before `method` is read. */
function buildManualReference(type: PaymentType, userId: string): string {
  return `upi_${RECEIPT_TYPE_CODES[type]}_${userId.slice(0, 8)}_${Date.now()}`;
}

/**
 * Reads a non-empty site_settings string value, or null if the row is
 * missing/blank — unlike getSiteSettingNumber above, there is no sane
 * fallback for "what UPI ID do I show" so callers must treat null as "this
 * checkout path isn't set up yet" rather than silently substituting
 * something.
 */
async function getSiteSettingString(key: string, authUser: RequestContextUser): Promise<string | null> {
  const row = await runInRequestContext(authUser, (t) => SiteSetting.findOne({ where: { key }, transaction: t }));
  const value = row?.value?.trim();
  return value ? value : null;
}

interface CreateOrderResult {
  paymentId: string;
  razorpayOrderId: string;
  amount: number;
  currency: string;
  razorpayKeyId: string;
}

/**
 * Shared "create local payments row + call Razorpay's Orders API" flow used
 * by all three checkout endpoints below. If Razorpay isn't configured (no
 * key id/secret set — a valid state in dev), this throws
 * ApiError.serviceUnavailable BEFORE attempting any Razorpay call or DB
 * write, per spec.
 *
 * The Razorpay HTTP call runs outside any DB transaction (it has no DB
 * dependency and there's no benefit to holding a transaction open across an
 * external network call); the local payments row is created afterward,
 * inside its own runInRequestContext transaction, once we have the real
 * razorpay_order_id the NOT NULL UNIQUE column requires.
 */
async function createOrderAndPaymentRow(
  authUser: RequestContextUser,
  params: { type: PaymentType; amount: number; metadata: PaymentMetadata },
): Promise<CreateOrderResult> {
  if (!isRazorpayConfigured()) {
    throw ApiError.serviceUnavailable('Payments are not configured in this environment');
  }

  const razorpay = getRazorpayClient();
  const order = await razorpay.orders.create({
    amount: Math.round(params.amount * 100),
    currency: 'INR',
    receipt: buildReceipt(params.type, authUser.id),
  });

  const payment = await runInRequestContext(authUser, (t) =>
    Payment.create(
      {
        type: params.type,
        payerUserId: authUser.id,
        amount: params.amount,
        currency: 'INR',
        status: 'created',
        razorpayOrderId: order.id,
        metadata: params.metadata,
      },
      { transaction: t },
    ),
  );

  return {
    paymentId: payment.id,
    // Never null here — this helper always sets it from a real Razorpay
    // order id above, unlike createManualPaymentRow's rows.
    razorpayOrderId: payment.razorpayOrderId as string,
    amount: payment.amount,
    currency: payment.currency,
    razorpayKeyId: env.RAZORPAY_KEY_ID,
  };
}

interface CreateManualOrderResult {
  paymentId: string;
  manualReference: string;
  amount: number;
  currency: string;
}

/**
 * Manual-UPI counterpart to createOrderAndPaymentRow above — no Razorpay
 * call, no razorpay_order_id. Throws ApiError.serviceUnavailable (same
 * convention as the Razorpay path's isRazorpayConfigured() check) if the
 * admin hasn't set a upi_id site_settings value yet, before writing
 * anything.
 */
async function createManualPaymentRow(
  authUser: RequestContextUser,
  params: { type: PaymentType; amount: number; metadata: PaymentMetadata },
): Promise<CreateManualOrderResult> {
  const upiId = await getSiteSettingString('upi_id', authUser);
  if (!upiId) {
    throw ApiError.serviceUnavailable('Manual UPI payments are not configured in this environment');
  }

  const manualReference = buildManualReference(params.type, authUser.id);

  const payment = await runInRequestContext(authUser, (t) =>
    Payment.create(
      {
        type: params.type,
        payerUserId: authUser.id,
        amount: params.amount,
        currency: 'INR',
        status: 'created',
        method: 'upi_manual',
        manualReference,
        metadata: params.metadata,
      },
      { transaction: t },
    ),
  );

  return {
    paymentId: payment.id,
    manualReference: payment.manualReference as string,
    amount: payment.amount,
    currency: payment.currency,
  };
}

// ---------------------------------------------------------------------
// POST /companies/payments/subscribe
// ---------------------------------------------------------------------

const subscribeSchema = z.object({ planId: z.string().uuid() });

export const subscribe = asyncHandler(async (req: Request, res: Response) => {
  const authUser = req.user!;
  const { planId } = subscribeSchema.parse(req.body);

  const plan = await runInRequestContext(authUser, (t) => PlanMaster.findByPk(planId, { transaction: t }));
  if (!plan || !plan.isActive) {
    throw ApiError.notFound('Plan not found or is not currently available');
  }

  const result = await createOrderAndPaymentRow(authUser, {
    type: 'subscription',
    amount: Number(plan.price),
    metadata: { planId },
  });

  res.status(201).json(result);
});

// ---------------------------------------------------------------------
// POST /companies/payments/subscribe/upi — manual UPI counterpart to
// subscribe() above. Same plan lookup/validation, different order-creation
// helper.
// ---------------------------------------------------------------------

export const subscribeUpi = asyncHandler(async (req: Request, res: Response) => {
  const authUser = req.user!;
  const { planId } = subscribeSchema.parse(req.body);

  const plan = await runInRequestContext(authUser, (t) => PlanMaster.findByPk(planId, { transaction: t }));
  if (!plan || !plan.isActive) {
    throw ApiError.notFound('Plan not found or is not currently available');
  }

  const result = await createManualPaymentRow(authUser, {
    type: 'subscription',
    amount: Number(plan.price),
    metadata: { planId },
  });

  res.status(201).json(result);
});

// ---------------------------------------------------------------------
// POST /companies/payments/unlock-topup
// ---------------------------------------------------------------------

const unlockTopupSchema = z.object({ quantity: z.number().int().min(1) });

export const unlockTopup = asyncHandler(async (req: Request, res: Response) => {
  const authUser = req.user!;
  const { quantity } = unlockTopupSchema.parse(req.body);

  const pricePerUnlock = await getSiteSettingNumber('price_per_unlock', 20, authUser);

  const result = await createOrderAndPaymentRow(authUser, {
    type: 'pay_per_unlock',
    amount: quantity * pricePerUnlock,
    metadata: { unlockQuantity: quantity },
  });

  res.status(201).json(result);
});

// ---------------------------------------------------------------------
// POST /candidates/payments/boost
// ---------------------------------------------------------------------

const boostSchema = z.object({ days: z.number().int().min(1).max(30) });

export const boost = asyncHandler(async (req: Request, res: Response) => {
  const authUser = req.user!;
  const { days } = boostSchema.parse(req.body);

  const pricePerDay = await getSiteSettingNumber('boost_price_per_day', 49, authUser);

  const result = await createOrderAndPaymentRow(authUser, {
    type: 'boost',
    amount: days * pricePerDay,
    metadata: { boostDays: days },
  });

  res.status(201).json(result);
});

// ---------------------------------------------------------------------
// POST /candidates/payments/boost/upi — manual UPI counterpart to boost()
// above.
// ---------------------------------------------------------------------

export const boostUpi = asyncHandler(async (req: Request, res: Response) => {
  const authUser = req.user!;
  const { days } = boostSchema.parse(req.body);

  const pricePerDay = await getSiteSettingNumber('boost_price_per_day', 49, authUser);

  const result = await createManualPaymentRow(authUser, {
    type: 'boost',
    amount: days * pricePerDay,
    metadata: { boostDays: days },
  });

  res.status(201).json(result);
});

// ---------------------------------------------------------------------
// POST /companies/jobs/:jobId/batches/:tier/purchase (AI Relevancy
// Packages, Feature 1 Phase 3) — a separate one-time purchase flow from
// subscribe/unlock-topup above: its own Payment row/line item, and it does
// not touch companyProfile.remainingUnlocks at all.
// ---------------------------------------------------------------------

const RELEVANCY_TIERS: RelevancyTier[] = ['100_percent', '90_plus', '75_plus', '50_plus'];

export const purchaseRelevancyPackage = asyncHandler(async (req: Request, res: Response) => {
  const authUser = req.user!;
  const { jobId, tier } = req.params;
  if (!RELEVANCY_TIERS.includes(tier as RelevancyTier)) {
    throw ApiError.badRequest('Invalid tier');
  }

  // Checked before any write — a relevancy_packages row created here and
  // then abandoned because Razorpay isn't configured would be a harmless
  // but pointless orphan; failing fast avoids it entirely.
  if (!isRazorpayConfigured()) {
    throw ApiError.serviceUnavailable('Payments are not configured in this environment');
  }

  const { candidateCount, band } = await runInRequestContext(authUser, async (t) => {
    const job = await Job.findOne({ where: { id: jobId, companyId: authUser.id }, transaction: t });
    if (!job) throw ApiError.notFound('Job not found');

    const candidateCount = await CandidateRelevancyScore.count({ where: { jobId, tier }, transaction: t });
    if (candidateCount === 0) {
      throw ApiError.badRequest('This batch has no candidates yet');
    }

    const bands = await RelevancyPackagePriceBand.findAll({
      order: [['sortOrder', 'ASC']],
      transaction: t,
    });
    const matched = bands.find(
      (b) => candidateCount >= b.minCandidates && (b.maxCandidates === null || candidateCount <= b.maxCandidates),
    );
    if (!matched) {
      throw ApiError.serviceUnavailable('No price band is configured for a batch of this size yet.');
    }
    if (matched.isContactSales || matched.price === null) {
      throw ApiError.badRequest(
        'This batch size is priced on request — contact sales rather than a self-serve purchase.',
      );
    }

    return { candidateCount, band: matched };
  });

  // Created unpurchased (purchasedByCompanyId/purchasedAt stay null) —
  // the webhook fills those in once payment is actually confirmed. This is
  // the one flow in this controller that writes a non-Payment row before
  // calling createOrderAndPaymentRow; every other checkout type here reuses
  // an existing PlanMaster/site_settings row instead of creating one.
  const relevancyPackage = await runInRequestContext(authUser, (t) =>
    RelevancyPackage.create(
      { jobId, tier: tier as RelevancyTier, candidateCount, price: Number(band.price) },
      { transaction: t },
    ),
  );

  const result = await createOrderAndPaymentRow(authUser, {
    type: 'relevancy_package',
    amount: Number(band.price),
    metadata: { relevancyPackageId: relevancyPackage.id },
  });

  res.status(201).json(result);
});

// ---------------------------------------------------------------------
// GET /companies/payments/history, GET /candidates/payments/history
// ---------------------------------------------------------------------

export const listMyPayments = asyncHandler(async (req: Request, res: Response) => {
  const authUser = req.user!;
  const query = paginationQuerySchema.parse(req.query);
  const { page, limit } = parsePagination(query.page, query.limit);

  const result = await runInRequestContext(authUser, async (t) => {
    // RLS's payments_owner_select already scopes this to the caller's own
    // rows; the explicit payerUserId filter here is defense-in-depth /
    // clarity, not the only thing enforcing ownership.
    const where = { payerUserId: authUser.id };
    const results = await Payment.findAll({
      where,
      order: [['createdAt', 'DESC']],
      limit,
      offset: (page - 1) * limit,
      transaction: t,
    });
    const totalCount = await Payment.count({ where, transaction: t });
    return { results, page, limit, totalCount };
  });

  res.json(result);
});

// ---------------------------------------------------------------------
// PATCH /payments/upi/:paymentId/submit — payer attaches the UPI
// transaction reference (UTR) to their own manual-method payment row.
// Requires requireAuth only (any role) — routes.ts; ownership is enforced
// both by the query below and by payments_owner_update_manual_upi's RLS.
// ---------------------------------------------------------------------

const submitUpiReferenceSchema = z.object({ upiUtr: z.string().trim().min(1).max(64) });

export const submitUpiReference = asyncHandler(async (req: Request, res: Response) => {
  const authUser = req.user!;
  const { paymentId } = req.params;
  const { upiUtr } = submitUpiReferenceSchema.parse(req.body);

  const payment = await runInRequestContext(authUser, async (t) => {
    const existing = await Payment.findOne({
      where: { id: paymentId, payerUserId: authUser.id, method: 'upi_manual' },
      transaction: t,
    });
    if (!existing) {
      throw ApiError.notFound('Payment not found');
    }
    if (existing.status !== 'created') {
      throw ApiError.badRequest('This payment has already been submitted or resolved');
    }

    existing.upiUtr = upiUtr;
    existing.status = 'submitted';
    existing.updatedAt = new Date();
    await existing.save({ transaction: t });
    return existing;
  });

  res.json(payment);
});

// ---------------------------------------------------------------------
// POST /payments/razorpay/webhook (public — no requireAuth, see routes)
// ---------------------------------------------------------------------

/**
 * Loosely typed incoming webhook payload — the `razorpay` npm package's
 * bundled types cover the Webhooks *management* API (create/list/delete
 * webhook subscriptions), not the shape of an inbound webhook POST body, so
 * this is hand-typed against Razorpay's documented payload.captured /
 * payload.failed event shapes.
 */
interface RazorpayWebhookEvent {
  event: string;
  payload?: {
    payment?: {
      entity: {
        id: string;
        order_id: string;
        amount: number;
        status: string;
      };
    };
  };
}

export function buildReceiptMessage(payment: Payment): string {
  switch (payment.type) {
    case 'subscription':
      return `Payment received — your subscription is now active.`;
    case 'pay_per_unlock': {
      const metadata = payment.metadata as { unlockQuantity: number };
      return `Payment received — ${metadata.unlockQuantity} unlock credit(s) added to your account.`;
    }
    case 'boost': {
      const metadata = payment.metadata as { boostDays: number };
      return `Payment received — your profile is boosted for ${metadata.boostDays} day(s).`;
    }
    case 'relevancy_package':
      return 'Payment received — your relevancy package is ready to download.';
    default:
      return 'Payment received.';
  }
}

/**
 * Short, human-readable description of what a payment was for — used as the
 * `description` in the payment receipt/failed emails (e.g. "Growth plan
 * subscription", "5 unlock credits", "7-day profile boost"). Separate from
 * buildReceiptMessage above (that one builds the in-app Notification's
 * message, which is already a full sentence); this is just the short noun
 * phrase the email templates slot into their own sentence.
 */
export async function buildPaymentDescription(payment: Payment, t: Transaction): Promise<string> {
  switch (payment.type) {
    case 'subscription': {
      const metadata = payment.metadata as { planId: string };
      const plan = await PlanMaster.findByPk(metadata.planId, { transaction: t });
      return plan ? `${plan.name} plan subscription` : 'plan subscription';
    }
    case 'pay_per_unlock': {
      const metadata = payment.metadata as { unlockQuantity: number };
      return `${metadata.unlockQuantity} unlock credit${metadata.unlockQuantity === 1 ? '' : 's'}`;
    }
    case 'boost': {
      const metadata = payment.metadata as { boostDays: number };
      return `${metadata.boostDays}-day profile boost`;
    }
    case 'relevancy_package': {
      const metadata = payment.metadata as { relevancyPackageId: string };
      const pkg = await RelevancyPackage.findByPk(metadata.relevancyPackageId, { transaction: t });
      return pkg ? `${pkg.candidateCount}-candidate relevancy package` : 'relevancy package';
    }
    default:
      return 'your purchase';
  }
}

/**
 * Applies the purchase's effect once a payment is confirmed `paid`. Must be
 * called in the same transaction as the payments row's status update — see
 * razorpayWebhook below.
 */
export async function applyPaymentEffect(payment: Payment, t: Transaction): Promise<void> {
  if (payment.type === 'subscription') {
    const metadata = payment.metadata as { planId: string };
    const plan = await PlanMaster.findByPk(metadata.planId, { transaction: t });
    const company = await CompanyProfile.findOne({ where: { userId: payment.payerUserId }, transaction: t });
    if (!plan || !company) return;

    // This is what finally makes unlocksResetAt/messagesPeriodResetAt real —
    // both columns have existed since Phase 3 but were never set until now.
    const now = new Date();
    const resetAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

    company.planId = plan.id;
    company.remainingUnlocks = plan.monthlyUnlocks;
    company.unlocksResetAt = resetAt;
    company.messagesSentThisPeriod = 0;
    company.messagesPeriodResetAt = resetAt;
    await company.save({ transaction: t });
    return;
  }

  if (payment.type === 'pay_per_unlock') {
    const metadata = payment.metadata as { unlockQuantity: number };
    const company = await CompanyProfile.findOne({ where: { userId: payment.payerUserId }, transaction: t });
    if (!company) return;

    // Additive — same semantics as adminController.grantUnlocks.
    company.remainingUnlocks += metadata.unlockQuantity;
    await company.save({ transaction: t });
    return;
  }

  if (payment.type === 'boost') {
    const metadata = payment.metadata as { boostDays: number };
    const profile = await CandidateProfile.findOne({ where: { userId: payment.payerUserId }, transaction: t });
    if (!profile) return;

    // Extends from whichever is later — an already-boosted candidate buying
    // more days stacks on top of their remaining boost instead of resetting.
    const now = new Date();
    const base = profile.boostExpiresAt && profile.boostExpiresAt > now ? profile.boostExpiresAt : now;
    profile.isBoosted = true;
    profile.boostExpiresAt = new Date(base.getTime() + metadata.boostDays * 24 * 60 * 60 * 1000);
    await profile.save({ transaction: t });
    return;
  }

  if (payment.type === 'relevancy_package') {
    const metadata = payment.metadata as { relevancyPackageId: string };
    const pkg = await RelevancyPackage.findByPk(metadata.relevancyPackageId, { transaction: t });
    if (!pkg) return;

    pkg.purchasedByCompanyId = payment.payerUserId;
    pkg.purchasedAt = new Date();
    await pkg.save({ transaction: t });
  }
}

export const razorpayWebhook = asyncHandler(async (req: Request, res: Response) => {
  const signatureHeader = req.headers['x-razorpay-signature'];
  const signature = Array.isArray(signatureHeader) ? signatureHeader[0] : signatureHeader;

  // req.rawBody is populated by app.ts's express.json({ verify }) hook — see
  // the comment there for why a second raw-body parser isn't needed. If
  // it's somehow missing (e.g. an empty body), treat that the same as a bad
  // signature: reject without touching the DB.
  if (!req.rawBody || !signature || !verifyWebhookSignature(req.rawBody.toString('utf8'), signature)) {
    res.status(400).json({ message: 'Invalid webhook signature' });
    return;
  }

  const event = req.body as RazorpayWebhookEvent;
  const paymentEntity = event.payload?.payment?.entity;

  // Signature is valid but this isn't an event type we track (e.g.
  // order.paid without a payment sub-entity, or some other Razorpay event
  // type) — acknowledge so Razorpay doesn't keep retrying it.
  if (!paymentEntity) {
    res.status(200).json({ received: true });
    return;
  }

  // Describes the one email (if any) to send once the transaction below has
  // committed — built inside the transaction (it needs the payer's User row
  // and, for subscriptions, a plan-name lookup) but not sent until after,
  // since sendEmail is an external network call with nothing to do with
  // this transaction's atomicity.
  type PaymentEmailTask =
    | { kind: 'receipt'; to: string; name: string; description: string; amount: number; currency: string }
    | { kind: 'failed'; to: string; name: string; description: string };

  const emailTask: PaymentEmailTask | null = await runInRequestContext(null, async (t) => {
    const payment = await Payment.findOne({
      where: { razorpayOrderId: paymentEntity.order_id },
      transaction: t,
    });

    // Unknown order — nothing local to update. Signature is already
    // verified, so this isn't a spoofing concern; just an event for an
    // order this instance doesn't have a row for (shouldn't normally
    // happen, but must not 500).
    if (!payment) return null;

    // Idempotency: Razorpay retries webhooks, and re-applying the effect
    // (e.g. granting unlocks twice, or re-emailing a receipt) would be a
    // real bug — a payment already in a terminal state is a no-op.
    if (payment.status === 'paid' || payment.status === 'failed') return null;

    if (event.event === 'payment.captured' || event.event === 'order.paid') {
      payment.status = 'paid';
      payment.razorpayPaymentId = paymentEntity.id;
      payment.razorpaySignature = signature;
      payment.updatedAt = new Date();
      await payment.save({ transaction: t });

      await applyPaymentEffect(payment, t);

      await Notification.create(
        {
          userId: payment.payerUserId,
          type: 'payment_receipt',
          message: buildReceiptMessage(payment),
          link: '/payments/history',
        },
        { transaction: t },
      );

      const payer = await User.findByPk(payment.payerUserId, { transaction: t });
      if (!payer) return null;
      const description = await buildPaymentDescription(payment, t);
      return {
        kind: 'receipt',
        to: payer.email,
        name: payer.fullName ?? payer.email,
        description,
        amount: Number(payment.amount),
        currency: payment.currency,
      };
    } else if (event.event === 'payment.failed') {
      payment.status = 'failed';
      payment.razorpayPaymentId = paymentEntity.id;
      payment.updatedAt = new Date();
      await payment.save({ transaction: t });

      await Notification.create(
        {
          userId: payment.payerUserId,
          type: 'payment_failed',
          message: 'Your payment could not be completed. Please try again.',
          link: '/payments/history',
        },
        { transaction: t },
      );

      const payer = await User.findByPk(payment.payerUserId, { transaction: t });
      if (!payer) return null;
      const description = await buildPaymentDescription(payment, t);
      return { kind: 'failed', to: payer.email, name: payer.fullName ?? payer.email, description };
    }

    return null;
  });

  // Sent AFTER the webhook's DB transaction has fully committed — the
  // payment status/Notification/quota updates above are already durable at
  // this point, so a slow or failed email (sendEmail never throws — see
  // utils/email.ts) can never roll back or fail this webhook. This matters
  // more here than anywhere else: Razorpay retries non-2xx responses, and
  // this handler must always return 200 once the payment itself has been
  // recorded correctly, regardless of what happens to the receipt email.
  if (emailTask) {
    const { subject, html } =
      emailTask.kind === 'receipt'
        ? paymentReceiptEmail(emailTask.name, emailTask.description, emailTask.amount, emailTask.currency)
        : paymentFailedEmail(emailTask.name, emailTask.description);
    await sendEmail({ to: emailTask.to, subject, html });
  }

  // 200 for every handled case (including `failed`) — only signature
  // failures above return non-2xx, since Razorpay will otherwise keep
  // retrying a successfully-processed webhook.
  res.status(200).json({ received: true });
});
