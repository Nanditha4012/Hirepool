import { useEffect, useState } from 'react'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Badge from '@/components/ui/Badge'
import PageSkeleton from '@/components/ui/PageSkeleton'
import PageLoader from '@/components/ui/PageLoader'
import { usePaymentCheckout } from '@/lib/usePaymentCheckout'
import { listCompanyPaymentHistory } from '@/lib/paymentsApi'
import { unlockCandidate } from '@/lib/companyApi'
import {
  RELEVANCY_TIERS,
  TIER_LABELS,
  createJob,
  getJobBatches,
  listBatchCandidates,
  listJobPackages,
  listMyJobs,
  listRelevancyPriceBands,
  purchaseRelevancyPackage,
  downloadRelevancyPackage,
  updateJob,
  type BatchCandidate,
  type JobBatchesResponse,
  type JobResponse,
  type RelevancyPackageRow,
  type RelevancyPackagePriceBand,
  type RelevancyTier,
} from '@/lib/relevancyApi'

const PARSE_STATUS_LABEL: Record<string, string> = {
  pending: 'Parsing…',
  success: 'Parsed',
  failed: 'Parsing failed',
  unavailable: 'AI parsing not configured for this environment',
}

function formatCurrency(amount: number): string {
  try {
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(
      amount,
    )
  } catch {
    return `₹${amount}`
  }
}

function priceForCount(bands: RelevancyPackagePriceBand[], count: number): RelevancyPackagePriceBand | null {
  return (
    bands.find((b) => count >= b.minCandidates && (b.maxCandidates === null || count <= b.maxCandidates)) ?? null
  )
}

// ---------------------------------------------------------------------------
// Job creation + list
// ---------------------------------------------------------------------------

function CreateJobForm({ onCreated }: { onCreated: (job: JobResponse) => void }) {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async () => {
    if (!title.trim()) {
      setError('A job title is required.')
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      const job = await createJob({ title: title.trim(), description: description.trim() || undefined })
      setTitle('')
      setDescription('')
      onCreated(job)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create job')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Card>
      <h3 className="text-sm font-semibold text-ink">Paste a job description</h3>
      <p className="mt-1 text-xs text-ink/50">
        Title is required. Add a description to get AI-scored candidate batches — a job with just a title can
        still be used for manual search later.
      </p>
      <div className="mt-3 flex flex-col gap-3">
        <Input label="Job title" value={title} onChange={(e) => setTitle(e.target.value)} />
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium text-ink" htmlFor="jd-description">
            Job description (optional)
          </label>
          <textarea
            id="jd-description"
            rows={6}
            className="rounded-card border border-line bg-card px-3 py-2 text-sm text-ink placeholder:text-ink/40 focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Paste the full job description…"
          />
        </div>
        {error && <p className="text-sm text-danger">{error}</p>}
        <Button type="button" size="sm" loading={submitting} onClick={handleSubmit} className="self-start">
          Create job
        </Button>
      </div>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Candidate row (batch browse)
// ---------------------------------------------------------------------------

function CandidateRow({
  candidate,
  onUnlock,
  unlocking,
}: {
  candidate: BatchCandidate
  onUnlock: (id: string) => void
  unlocking: boolean
}) {
  return (
    <div className="flex flex-col gap-2 rounded-card border border-line p-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-semibold text-ink">{candidate.fullName ?? 'Candidate'}</p>
          <p className="text-sm text-ink/60">
            {candidate.primaryRole?.roleName ?? 'Role not set'} · {candidate.yearsOfExperience ?? 0} yrs
          </p>
        </div>
        <Badge tone="verified">{candidate.relevancyPercent}% match</Badge>
      </div>
      {candidate.skills.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {candidate.skills.slice(0, 6).map((s) => (
            <span key={s.id} className="rounded-full bg-surface px-2 py-0.5 text-xs text-ink/70">
              {s.skillName}
            </span>
          ))}
        </div>
      )}
      <p className="text-xs text-ink/50">
        {candidate.domain?.domainName ?? 'Domain not set'} · {candidate.location ?? 'Location not set'}
      </p>
      {candidate.isUnlockedByMe ? (
        <div className="mt-1 text-sm text-ink">
          {candidate.email && <p>{candidate.email}</p>}
          {candidate.phone && <p>{candidate.phone}</p>}
        </div>
      ) : (
        <Button type="button" size="sm" variant="secondary" loading={unlocking} onClick={() => onUnlock(candidate.id)}>
          Unlock Contact
        </Button>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// One tier card: count, price, browse toggle, buy/download
// ---------------------------------------------------------------------------

function TierCard({
  jobId,
  tier,
  candidateCount,
  priceBand,
  purchasedPackage,
  onPurchased,
}: {
  jobId: string
  tier: RelevancyTier
  candidateCount: number
  priceBand: RelevancyPackagePriceBand | null
  purchasedPackage: RelevancyPackageRow | undefined
  onPurchased: () => void
}) {
  const [expanded, setExpanded] = useState(false)
  const [candidates, setCandidates] = useState<BatchCandidate[]>([])
  const [loadingCandidates, setLoadingCandidates] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [unlockingId, setUnlockingId] = useState<string | null>(null)
  const [buyError, setBuyError] = useState<string | null>(null)
  const [downloadError, setDownloadError] = useState<string | null>(null)
  const [downloading, setDownloading] = useState(false)

  const checkout = usePaymentCheckout({
    pollHistory: listCompanyPaymentHistory,
    description: `Relevancy package — ${TIER_LABELS[tier]}`,
  })

  const toggleExpand = async () => {
    const next = !expanded
    setExpanded(next)
    if (next && candidates.length === 0 && candidateCount > 0) {
      setLoadingCandidates(true)
      setLoadError(null)
      try {
        const result = await listBatchCandidates(jobId, tier)
        setCandidates(result.results)
      } catch (err) {
        setLoadError(err instanceof Error ? err.message : 'Failed to load candidates')
      } finally {
        setLoadingCandidates(false)
      }
    }
  }

  const handleUnlock = async (candidateId: string) => {
    setUnlockingId(candidateId)
    try {
      const response = await unlockCandidate(candidateId)
      setCandidates((prev) =>
        prev.map((c) =>
          c.id === candidateId
            ? { ...c, isUnlockedByMe: true, phone: response.phone, email: response.email }
            : c,
        ),
      )
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Failed to unlock candidate')
    } finally {
      setUnlockingId(null)
    }
  }

  const handleBuy = async () => {
    setBuyError(null)
    try {
      const order = await purchaseRelevancyPackage(jobId, tier)
      await checkout.start(order)
    } catch (err) {
      setBuyError(err instanceof Error ? err.message : 'Failed to start checkout')
    }
  }

  // Once the poll inside usePaymentCheckout confirms the payment landed,
  // refresh the parent's package list so the Download button appears —
  // the webhook is what actually creates the purchased state, this just
  // re-reads it.
  useEffect(() => {
    if (checkout.status === 'confirmed') {
      onPurchased()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checkout.status])

  const handleDownload = async () => {
    if (!purchasedPackage) return
    setDownloading(true)
    setDownloadError(null)
    try {
      await downloadRelevancyPackage(purchasedPackage.id)
    } catch (err) {
      setDownloadError(err instanceof Error ? err.message : 'Failed to download package')
    } finally {
      setDownloading(false)
    }
  }

  const isContactSalesOnly = priceBand?.isContactSales ?? false

  return (
    <Card>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-lg font-bold text-ink">{TIER_LABELS[tier]}</p>
          <p className="text-sm text-ink/60">{candidateCount} candidate{candidateCount === 1 ? '' : 's'}</p>
        </div>
        {priceBand && (
          <Badge tone={isContactSalesOnly ? 'boost' : 'neutral'}>
            {isContactSalesOnly ? 'Contact sales' : priceBand.price !== null ? formatCurrency(priceBand.price) : '—'}
          </Badge>
        )}
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <Button type="button" size="sm" variant="secondary" disabled={candidateCount === 0} onClick={toggleExpand}>
          {expanded ? 'Hide candidates' : 'Browse batch'}
        </Button>

        {purchasedPackage ? (
          <Button type="button" size="sm" loading={downloading} onClick={handleDownload}>
            Download package
          </Button>
        ) : (
          <Button
            type="button"
            size="sm"
            disabled={candidateCount === 0 || isContactSalesOnly || checkout.status === 'opening' || checkout.status === 'processing'}
            loading={checkout.status === 'opening' || checkout.status === 'processing'}
            onClick={handleBuy}
          >
            {isContactSalesOnly ? 'Contact sales for pricing' : 'Buy this batch'}
          </Button>
        )}
      </div>

      {buyError && <p className="mt-2 text-sm text-danger">{buyError}</p>}
      {downloadError && <p className="mt-2 text-sm text-danger">{downloadError}</p>}
      {checkout.status === 'dismissed' && <p className="mt-2 text-sm text-ink/50">Checkout closed.</p>}
      {checkout.status === 'timeout' && (
        <p className="mt-2 text-sm text-ink/50">Payment is still processing — check back shortly.</p>
      )}
      {checkout.status === 'error' && checkout.error && (
        <p className="mt-2 text-sm text-danger">{checkout.error}</p>
      )}
      {purchasedPackage?.downloadedAt && (
        <p className="mt-2 text-xs text-ink/40">
          First downloaded {new Date(purchasedPackage.downloadedAt).toLocaleString()}
        </p>
      )}

      {expanded && (
        <div className="mt-4 flex flex-col gap-3 border-t border-line pt-4">
          {loadingCandidates && <PageLoader compact label="Loading candidates…" />}
          {loadError && <p className="text-sm text-danger">{loadError}</p>}
          {!loadingCandidates &&
            candidates.map((c) => (
              <CandidateRow
                key={c.id}
                candidate={c}
                onUnlock={handleUnlock}
                unlocking={unlockingId === c.id}
              />
            ))}
        </div>
      )}
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Job detail: parsed requirements + tier cards
// ---------------------------------------------------------------------------

function JobDetail({ job, priceBands }: { job: JobResponse; priceBands: RelevancyPackagePriceBand[] }) {
  const [current, setCurrent] = useState(job)
  const [batches, setBatches] = useState<JobBatchesResponse | null>(null)
  const [packages, setPackages] = useState<RelevancyPackageRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = async () => {
    setLoading(true)
    setError(null)
    try {
      const [batchesResult, packagesResult] = await Promise.all([
        getJobBatches(current.id),
        listJobPackages(current.id),
      ])
      setBatches(batchesResult)
      setPackages(packagesResult)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load batches')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    setCurrent(job)
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [job.id])

  const handleReparse = async () => {
    if (!current.description) return
    try {
      const refreshed = await updateJob(current.id, { description: current.description })
      setCurrent(refreshed)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to re-parse job')
    }
  }

  const packageForTier = (tier: RelevancyTier) => packages.find((p) => p.tier === tier)

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold text-ink">{current.title}</h2>
            {current.description && <p className="mt-2 whitespace-pre-wrap text-sm text-ink/70">{current.description}</p>}
          </div>
          {current.requirementsParsed && (
            <Badge tone={current.requirementsParsed.parseStatus === 'success' ? 'verified' : 'boost'}>
              {PARSE_STATUS_LABEL[current.requirementsParsed.parseStatus] ?? current.requirementsParsed.parseStatus}
            </Badge>
          )}
        </div>

        {current.requirementsParsed?.parseStatus === 'success' && (
          <div className="mt-4 grid grid-cols-1 gap-3 border-t border-line pt-4 sm:grid-cols-2">
            <div>
              <p className="text-xs font-medium uppercase text-ink/40">Extracted role</p>
              <p className="text-sm text-ink">{current.requirementsParsed.extractedRole ?? '—'}</p>
            </div>
            <div>
              <p className="text-xs font-medium uppercase text-ink/40">Minimum experience</p>
              <p className="text-sm text-ink">
                {current.requirementsParsed.extractedExperienceLevel ?? 0} yrs
              </p>
            </div>
            <div>
              <p className="text-xs font-medium uppercase text-ink/40">Domain</p>
              <p className="text-sm text-ink">{current.requirementsParsed.extractedDomain ?? '—'}</p>
            </div>
            <div>
              <p className="text-xs font-medium uppercase text-ink/40">Required skills</p>
              <div className="mt-1 flex flex-wrap gap-1.5">
                {current.requirementsParsed.extractedSkills.length === 0 && (
                  <p className="text-sm text-ink/50">None extracted</p>
                )}
                {current.requirementsParsed.extractedSkills.map((s) => (
                  <span key={s} className="rounded-full bg-surface px-2 py-0.5 text-xs text-ink/70">
                    {s}
                  </span>
                ))}
              </div>
            </div>
          </div>
        )}

        {current.requirementsParsed?.parseStatus === 'failed' && (
          <div className="mt-4 border-t border-line pt-4">
            <p className="text-sm text-danger">{current.requirementsParsed.parseError ?? 'Parsing failed.'}</p>
            <Button type="button" size="sm" variant="secondary" className="mt-2" onClick={handleReparse}>
              Retry parsing
            </Button>
          </div>
        )}

        {current.requirementsParsed?.parseStatus === 'unavailable' && (
          <div className="mt-4 border-t border-line pt-4">
            <p className="text-sm text-ink/60">
              AI parsing isn't configured in this environment yet — candidate scoring for this job is unavailable
              until it is.
            </p>
          </div>
        )}
      </Card>

      {loading && <PageLoader compact label="Loading batches…" />}
      {error && <p className="text-danger">{error}</p>}
      {!loading && !error && batches && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {RELEVANCY_TIERS.map((tier) => {
            const tierData = batches.tiers.find((t) => t.tier === tier)
            const count = tierData?.candidateCount ?? 0
            const band = priceForCount(priceBands, count)
            return (
              <TierCard
                key={tier}
                jobId={current.id}
                tier={tier}
                candidateCount={count}
                priceBand={band}
                purchasedPackage={packageForTier(tier)}
                onPurchased={load}
              />
            )
          })}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function RelevancyPage() {
  const [jobs, setJobs] = useState<JobResponse[]>([])
  const [priceBands, setPriceBands] = useState<RelevancyPackagePriceBand[]>([])
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = async () => {
    setLoading(true)
    setError(null)
    try {
      const [jobsResult, bandsResult] = await Promise.all([listMyJobs(), listRelevancyPriceBands()])
      setJobs(jobsResult)
      setPriceBands(bandsResult)
      if (jobsResult.length > 0 && !selectedJobId) {
        setSelectedJobId(jobsResult[0].id)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load jobs')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const selectedJob = jobs.find((j) => j.id === selectedJobId) ?? null

  if (loading) {
    return <PageSkeleton blocks={3} />
  }

  return (
    <div className="mx-auto max-w-app px-4 py-10 sm:px-6 lg:px-10">
      <h1 className="text-2xl font-bold text-ink">AI Relevancy Packages</h1>
      <p className="mt-1 text-ink/60">
        Paste a job description once — Hirepool scores every approved candidate against it and groups them into
        ready-made batches.
      </p>

      {error && <p className="mt-4 text-danger">{error}</p>}

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[320px_1fr]">
        <div className="flex flex-col gap-4">
          <CreateJobForm
            onCreated={(job) => {
              setJobs((prev) => [job, ...prev])
              setSelectedJobId(job.id)
            }}
          />

          <Card>
            <h3 className="text-sm font-semibold text-ink">Your jobs</h3>
            {jobs.length === 0 && <p className="mt-3 text-sm text-ink/50">No jobs yet — create one to get started.</p>}
            <div className="mt-3 flex flex-col gap-2">
              {jobs.map((job) => (
                <button
                  key={job.id}
                  type="button"
                  onClick={() => setSelectedJobId(job.id)}
                  className={`rounded-card border p-3 text-left transition-colors ${
                    selectedJobId === job.id ? 'border-primary bg-surface-subtle' : 'border-line/60'
                  }`}
                >
                  <p className="font-medium text-ink">{job.title}</p>
                  <p className="text-xs text-ink/50">{new Date(job.createdAt).toLocaleDateString()}</p>
                </button>
              ))}
            </div>
          </Card>
        </div>

        <div>{selectedJob && <JobDetail job={selectedJob} priceBands={priceBands} />}</div>
      </div>
    </div>
  )
}
