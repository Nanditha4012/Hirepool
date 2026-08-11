import { apiFetch } from './apiClient'

// Thin typed wrappers over apiFetch for Walk-in Pedia, the Job Book and
// Communities. One function per endpoint, same flat no-caching style as
// candidateApi.ts / companyApi.ts — callers own their own state.

export type FeedPostKind = 'walkin' | 'job' | 'community'

/** Which section of the walk-in screen a drive belongs to. Server-decided. */
export type WalkinBucket = 'today' | 'upcoming' | 'over'

/**
 * Who published a post, as recorded on the post itself rather than joined
 * from `users` — see the column comment in the social-module migration. The
 * practical consequence for the UI: a name here is a snapshot, so don't build
 * anything that assumes it tracks a live account.
 */
export interface FeedAuthor {
  id: string
  name: string
  role: string
}

export interface FeedPost {
  id: string
  kind: FeedPostKind
  title: string
  body: string | null
  companyName: string | null
  roleTitle: string | null
  location: string | null
  qualification: string | null
  experience: string | null
  salary: string | null
  walkinDate: string | null
  walkinStartTime: string | null
  walkinEndTime: string | null
  venue: string | null
  applyLink: string | null
  contactPerson: string | null
  contactEmail: string | null
  contactPhone: string | null
  whatsappLink: string | null
  imageLink: string | null
  postedOnBehalf: boolean
  bucket: WalkinBucket | null
  community: { id: string; slug: string; name: string; icon: string | null } | null
  author: FeedAuthor
  likeCount: number
  likedByMe: boolean
  commentCount: number
  scamCount: number
  reportedByMe: boolean
  canEdit: boolean
  createdAt: string
  updatedAt: string
}

// ---------------------------------------------------------------------------
// Walk-in Pedia
// ---------------------------------------------------------------------------

export interface WalkinFeed {
  today: FeedPost[]
  upcoming: FeedPost[]
  over: FeedPost[]
  /** The server's idea of today, so section labels agree with its bucketing. */
  todayDate: string
}

export interface WalkinFilters {
  location?: string
  date?: string
  q?: string
}

/** Serialises a filter object, dropping unset and blank values. */
function queryString(params: object): string {
  const query = new URLSearchParams()
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === '') return
    query.set(key, String(value))
  })
  const qs = query.toString()
  return qs ? `?${qs}` : ''
}

export function listWalkins(filters: WalkinFilters = {}) {
  return apiFetch<WalkinFeed>(`/feed/walkins${queryString(filters)}`)
}

export function listWalkinLocations() {
  return apiFetch<string[]>('/feed/walkins/locations')
}

// ---------------------------------------------------------------------------
// Job Book
// ---------------------------------------------------------------------------

export interface FeedPage {
  results: FeedPost[]
  page: number
  limit: number
  totalCount: number
}

export interface JobFilters {
  location?: string
  q?: string
  page?: number
  limit?: number
}

export function listJobs(filters: JobFilters = {}) {
  return apiFetch<FeedPage>(`/feed/jobs${queryString(filters)}`)
}

// ---------------------------------------------------------------------------
// Posting
// ---------------------------------------------------------------------------

/** Shared by walk-in and job posts. */
interface HiringPostFields {
  title: string
  body?: string
  companyName: string
  roleTitle: string
  location: string
  qualification: string
  experience?: string
  salary?: string
  applyLink?: string
  contactPerson?: string
  contactEmail?: string
  contactPhone?: string
  whatsappLink?: string
  imageLink?: string
  /** A candidate posting a drive they heard about, not the company itself. */
  postedOnBehalf?: boolean
}

export interface CreateWalkinBody extends HiringPostFields {
  kind: 'walkin'
  walkinDate: string
  walkinStartTime?: string
  walkinEndTime?: string
  venue: string
}

export interface CreateJobBody extends HiringPostFields {
  kind: 'job'
}

export interface CreateCommunityPostBody {
  kind: 'community'
  communityId: string
  title: string
  body?: string
  imageLink?: string
}

export type CreatePostBody = CreateWalkinBody | CreateJobBody | CreateCommunityPostBody

export function createPost(body: CreatePostBody) {
  return apiFetch<FeedPost>('/feed/posts', { method: 'POST', body: JSON.stringify(body) })
}

export function getPost(id: string) {
  return apiFetch<FeedPost>(`/feed/posts/${id}`)
}

export function deletePost(id: string) {
  return apiFetch<void>(`/feed/posts/${id}`, { method: 'DELETE' })
}

// ---------------------------------------------------------------------------
// Like / discussion / scam
// ---------------------------------------------------------------------------

export interface LikeResult {
  likeCount: number
  likedByMe: boolean
}

export function toggleLike(postId: string) {
  return apiFetch<LikeResult>(`/feed/posts/${postId}/like`, { method: 'POST' })
}

export interface ReportResult {
  scamCount: number
  reportedByMe: boolean
}

export function toggleScamReport(postId: string, reason?: string) {
  return apiFetch<ReportResult>(`/feed/posts/${postId}/report`, {
    method: 'POST',
    body: JSON.stringify({ reason }),
  })
}

export interface PostComment {
  id: string
  body: string
  author: FeedAuthor
  canDelete: boolean
  createdAt: string
}

export function listComments(postId: string) {
  return apiFetch<PostComment[]>(`/feed/posts/${postId}/comments`)
}

export function addComment(postId: string, body: string) {
  return apiFetch<{ id: string; commentCount: number }>(`/feed/posts/${postId}/comments`, {
    method: 'POST',
    body: JSON.stringify({ body }),
  })
}

export function deleteComment(commentId: string) {
  return apiFetch<void>(`/feed/comments/${commentId}`, { method: 'DELETE' })
}

// ---------------------------------------------------------------------------
// Communities
// ---------------------------------------------------------------------------

export interface CommunitySummary {
  id: string
  slug: string
  name: string
  description: string | null
  icon: string | null
  memberCount: number
  postCount: number
  joined: boolean
}

export function listCommunities() {
  return apiFetch<CommunitySummary[]>('/communities')
}

export interface CommunityFeed {
  community: {
    id: string
    slug: string
    name: string
    description: string | null
    icon: string | null
    memberCount: number
    joined: boolean
  }
  results: FeedPost[]
  page: number
  limit: number
  totalCount: number
}

export function listCommunityPosts(slug: string, filters: JobFilters = {}) {
  return apiFetch<CommunityFeed>(`/communities/${slug}/posts${queryString(filters)}`)
}

export function listMyCommunityFeed(filters: JobFilters = {}) {
  return apiFetch<FeedPage>(`/communities/me/feed${queryString(filters)}`)
}

export interface MembershipResult {
  joined: boolean
  memberCount: number
}

export function joinCommunity(slug: string) {
  return apiFetch<MembershipResult>(`/communities/${slug}/join`, { method: 'POST' })
}

export function leaveCommunity(slug: string) {
  return apiFetch<MembershipResult>(`/communities/${slug}/join`, { method: 'DELETE' })
}
