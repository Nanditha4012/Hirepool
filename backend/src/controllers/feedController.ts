import { Request, Response } from 'express';
import { Includeable, Op, Transaction, WhereOptions } from 'sequelize';
import { z } from 'zod';
import {
  User,
  CompanyProfile,
  Community,
  CommunityMember,
  FeedPost,
  PostReaction,
  PostComment,
  CommentReaction,
  PostReport,
} from '../models';
import type { FeedPostKind } from '../models/FeedPost';
import { asyncHandler } from '../utils/asyncHandler';
import { ApiError } from '../utils/ApiError';
import { runInRequestContext } from '../utils/withRequestContext';

/**
 * Walk-in Pedia, Job Book and Community posts.
 *
 * All three are rows in `feed_posts` distinguished by `kind` (see the header
 * of migrations/20240113000001-social-module.js for why they share a table).
 * The columns are nullable at the database level, so the per-kind schemas
 * below are what actually enforce "a walk-in must say when, where and what
 * role" and "a Job Book post must carry a way to apply" — those rules live
 * here and nowhere else.
 */

// ---------------------------------------------------------------------
// Today
//
// Whether a drive is "today" is a question about the calendar day in the
// city the drive is held in, and this product's drives are in India. The
// server's own clock is UTC on Vercel and most hosts, so deriving the date
// from `new Date().toISOString()` would flip the Today section over to
// tomorrow's drives at 05:30 IST — the section would be wrong for the entire
// morning, every morning. Formatting in an explicit zone keeps the boundary
// at local midnight.
//
// A single zone rather than per-post: a drive in Bengaluru and one in Delhi
// share a calendar day, and HirePool is not multi-country. If that changes
// this becomes a per-post `timezone` column, not a different constant.
// ---------------------------------------------------------------------
const APP_TIMEZONE = 'Asia/Kolkata';

/** `YYYY-MM-DD` for "now" in the app's timezone. 'en-CA' formats ISO-style. */
function todayInAppTimezone(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: APP_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

export type WalkinBucket = 'today' | 'upcoming' | 'over';

function bucketFor(walkinDate: string | null, today: string): WalkinBucket {
  if (!walkinDate) return 'over';
  if (walkinDate === today) return 'today';
  // Both sides are zero-padded `YYYY-MM-DD`, so a string comparison is a
  // chronological one.
  return walkinDate > today ? 'upcoming' : 'over';
}

// ---------------------------------------------------------------------
// Serialisation
// ---------------------------------------------------------------------

interface FeedAuthor {
  id: string;
  name: string;
  role: string;
}

interface FeedPostResponse {
  id: string;
  kind: FeedPostKind;
  title: string;
  body: string | null;
  companyName: string | null;
  roleTitle: string | null;
  location: string | null;
  qualification: string | null;
  experience: string | null;
  salary: string | null;
  walkinDate: string | null;
  walkinStartTime: string | null;
  walkinEndTime: string | null;
  venue: string | null;
  applyLink: string | null;
  contactPerson: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  whatsappLink: string | null;
  imageLink: string | null;
  postedOnBehalf: boolean;
  bucket: WalkinBucket | null;
  community: { id: string; slug: string; name: string; icon: string | null } | null;
  author: FeedAuthor;
  likeCount: number;
  likedByMe: boolean;
  commentCount: number;
  scamCount: number;
  reportedByMe: boolean;
  canEdit: boolean;
  createdAt: Date;
  updatedAt: Date;
}

type PostWithRelations = FeedPost & { community?: Community | null };

/**
 * The include chain every post list/detail query uses, so they can't drift.
 *
 * Note what is *not* here: a join to `users` for the author. The policies on
 * that table grant a signed-in user their own row and no other, so under the
 * access model this project is written to, such a join resolves a name for
 * whichever posts the reader wrote and NULL for every other one on the page.
 * The author is recorded on the post instead — see the column comment in
 * 20240113000001-social-module.js — which makes the feed's author line
 * correct regardless of how those policies are configured.
 */
const postIncludes: Includeable[] = [
  { model: Community, as: 'community', attributes: ['id', 'slug', 'name', 'icon'] },
];

/**
 * The name to publish under, resolved once at write time from the rows the
 * author is allowed to read about themselves.
 *
 * Never the email address. These posts are visible to every signed-in user,
 * and an account's login address is not something posting a walk-in should
 * broadcast — so an account with nothing else on file posts under a neutral
 * label rather than under its inbox. Signup seeds `companyName` with the
 * account email as a placeholder, which is what the '@' guard catches.
 */
async function resolveAuthorName(userId: string, t: Transaction): Promise<string> {
  const user = await User.findByPk(userId, { attributes: ['fullName'], transaction: t });
  if (user?.fullName) return user.fullName;

  const profile = await CompanyProfile.findOne({
    where: { userId },
    attributes: ['companyName'],
    transaction: t,
  });
  if (profile?.companyName && !profile.companyName.includes('@')) return profile.companyName;

  return 'HirePool member';
}

/**
 * Turns post rows into responses, loading the like/comment/scam tallies for
 * the whole page in three grouped queries rather than three per post.
 */
async function serializePosts(
  posts: PostWithRelations[],
  viewerId: string,
  t: Transaction,
): Promise<FeedPostResponse[]> {
  if (posts.length === 0) return [];

  const ids = posts.map((post) => post.id);
  const today = todayInAppTimezone();

  const [reactions, comments, reports] = await Promise.all([
    PostReaction.findAll({
      where: { postId: { [Op.in]: ids } },
      attributes: ['postId', 'userId'],
      transaction: t,
    }),
    PostComment.findAll({ where: { postId: { [Op.in]: ids } }, attributes: ['postId'], transaction: t }),
    PostReport.findAll({
      where: { postId: { [Op.in]: ids } },
      attributes: ['postId', 'userId'],
      transaction: t,
    }),
  ]);

  const likeCounts = new Map<string, number>();
  const likedByMe = new Set<string>();
  for (const row of reactions) {
    likeCounts.set(row.postId, (likeCounts.get(row.postId) ?? 0) + 1);
    if (row.userId === viewerId) likedByMe.add(row.postId);
  }

  const commentCounts = new Map<string, number>();
  for (const row of comments) {
    commentCounts.set(row.postId, (commentCounts.get(row.postId) ?? 0) + 1);
  }

  const scamCounts = new Map<string, number>();
  const reportedByMe = new Set<string>();
  for (const row of reports) {
    scamCounts.set(row.postId, (scamCounts.get(row.postId) ?? 0) + 1);
    // `userId` is compared here and then dropped. It must never reach the
    // response — see the RLS note on post_reports in the migration.
    if (row.userId === viewerId) reportedByMe.add(row.postId);
  }

  return posts.map((post) => ({
    id: post.id,
    kind: post.kind,
    title: post.title,
    body: post.body,
    companyName: post.companyName,
    roleTitle: post.roleTitle,
    location: post.location,
    qualification: post.qualification,
    experience: post.experience,
    salary: post.salary,
    walkinDate: post.walkinDate,
    walkinStartTime: post.walkinStartTime,
    walkinEndTime: post.walkinEndTime,
    venue: post.venue,
    applyLink: post.applyLink,
    contactPerson: post.contactPerson,
    contactEmail: post.contactEmail,
    contactPhone: post.contactPhone,
    whatsappLink: post.whatsappLink,
    imageLink: post.imageLink,
    postedOnBehalf: post.postedOnBehalf,
    bucket: post.kind === 'walkin' ? bucketFor(post.walkinDate, today) : null,
    community: post.community
      ? {
          id: post.community.id,
          slug: post.community.slug,
          name: post.community.name,
          icon: post.community.icon,
        }
      : null,
    author: { id: post.authorId, name: post.authorName, role: post.authorRole },
    likeCount: likeCounts.get(post.id) ?? 0,
    likedByMe: likedByMe.has(post.id),
    commentCount: commentCounts.get(post.id) ?? 0,
    scamCount: scamCounts.get(post.id) ?? 0,
    reportedByMe: reportedByMe.has(post.id),
    canEdit: post.authorId === viewerId,
    createdAt: post.createdAt,
    updatedAt: post.updatedAt,
  }));
}

/**
 * Every feed query starts here.
 *
 * `is_removed` is also the subject of an RLS policy, and this repeats it in
 * the controller on purpose. The app's database role is `postgres`, which
 * carries `rolbypassrls`, so RLS is not actually being enforced against these
 * queries in the current deployment — a moderator's takedown that relied on
 * the policy alone would simply not hide anything. Stated as a filter here,
 * it holds either way.
 */
const visibleOnly: WhereOptions = { isRemoved: false };

/** Case-insensitive "contains", for the free-text filters. */
function contains(column: string, value: string): WhereOptions {
  return { [column]: { [Op.iLike]: `%${value}%` } };
}

/** Matches a search term against the three fields worth searching. */
function searchTerm(value: string): WhereOptions {
  return {
    [Op.or]: [contains('title', value), contains('companyName', value), contains('roleTitle', value)],
  };
}

// ---------------------------------------------------------------------
// GET /feed/walkins
//
// Returns the three sections the screen renders rather than one flat list:
// today's drives first (the green-bordered ones — the drives you can still
// physically attend), then upcoming, then the ones that are over. Grouping
// server-side keeps "which bucket is this in" defined in one place, next to
// the timezone decision it depends on.
// ---------------------------------------------------------------------

const walkinQuerySchema = z.object({
  location: z.string().trim().min(1).optional(),
  /** Exact calendar day, `YYYY-MM-DD`. */
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'date must be YYYY-MM-DD')
    .optional(),
  q: z.string().trim().min(1).optional(),
});

/** How many finished drives to keep on screen. They are history, not a feed. */
const OVER_LIMIT = 30;

export const listWalkins = asyncHandler(async (req: Request, res: Response) => {
  const authUser = req.user!;
  const query = walkinQuerySchema.parse(req.query);

  const result = await runInRequestContext(authUser, async (t) => {
    const conditions: WhereOptions[] = [{ kind: 'walkin' }, visibleOnly];
    if (query.date) conditions.push({ walkinDate: query.date });
    if (query.location) conditions.push(contains('location', query.location));
    if (query.q) conditions.push(searchTerm(query.q));

    const posts = (await FeedPost.findAll({
      where: { [Op.and]: conditions },
      include: postIncludes,
      // Soonest first. Postgres sorts NULLs last on ASC by default, which is
      // where blank dates belong — the bucketing treats them as over.
      order: [
        ['walkinDate', 'ASC'],
        ['createdAt', 'DESC'],
      ],
      transaction: t,
    })) as PostWithRelations[];

    const serialized = await serializePosts(posts, authUser.id, t);

    return {
      today: serialized.filter((post) => post.bucket === 'today'),
      upcoming: serialized.filter((post) => post.bucket === 'upcoming'),
      // Most recently finished first — yesterday's drive is more use than one
      // from three months ago, which is the opposite of the ascending order
      // the other two sections want.
      over: serialized
        .filter((post) => post.bucket === 'over')
        .sort((a, b) => (b.walkinDate ?? '').localeCompare(a.walkinDate ?? ''))
        .slice(0, OVER_LIMIT),
      /** So the client labels sections against the same day the server used. */
      todayDate: todayInAppTimezone(),
    };
  });

  res.json(result);
});

/**
 * GET /feed/walkins/locations — the distinct cities that currently have
 * drives, for the location filter. Derived rather than a master table: the
 * filter should only offer places something is actually happening.
 */
export const listWalkinLocations = asyncHandler(async (req: Request, res: Response) => {
  const authUser = req.user!;

  const locations = await runInRequestContext(authUser, async (t) => {
    const rows = await FeedPost.findAll({
      where: { kind: 'walkin', isRemoved: false, location: { [Op.ne]: null } },
      attributes: ['location'],
      group: ['location'],
      order: [['location', 'ASC']],
      transaction: t,
    });
    return rows.map((row) => row.location).filter((value): value is string => Boolean(value));
  });

  res.json(locations);
});

// ---------------------------------------------------------------------
// GET /feed/jobs
// ---------------------------------------------------------------------

const listQuerySchema = z.object({
  location: z.string().trim().min(1).optional(),
  q: z.string().trim().min(1).optional(),
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).optional(),
});

function parsePaging(query: z.infer<typeof listQuerySchema>): { page: number; limit: number } {
  return { page: query.page ?? 1, limit: Math.min(query.limit ?? 20, 50) };
}

export const listJobs = asyncHandler(async (req: Request, res: Response) => {
  const authUser = req.user!;
  const query = listQuerySchema.parse(req.query);
  const { page, limit } = parsePaging(query);

  const result = await runInRequestContext(authUser, async (t) => {
    const conditions: WhereOptions[] = [{ kind: 'job' }, visibleOnly];
    if (query.location) conditions.push(contains('location', query.location));
    if (query.q) conditions.push(searchTerm(query.q));
    const where = { [Op.and]: conditions };

    const posts = (await FeedPost.findAll({
      where,
      include: postIncludes,
      order: [['createdAt', 'DESC']],
      limit,
      offset: (page - 1) * limit,
      transaction: t,
    })) as PostWithRelations[];

    const totalCount = await FeedPost.count({ where, transaction: t });

    return { results: await serializePosts(posts, authUser.id, t), page, limit, totalCount };
  });

  res.json(result);
});

// ---------------------------------------------------------------------
// GET /feed/posts/:id
// ---------------------------------------------------------------------

async function findPostOr404(id: string, t: Transaction): Promise<PostWithRelations> {
  const post = (await FeedPost.findByPk(id, {
    include: postIncludes,
    transaction: t,
  })) as PostWithRelations | null;
  if (!post) throw ApiError.notFound('Post not found');
  return post;
}

export const getPost = asyncHandler(async (req: Request, res: Response) => {
  const authUser = req.user!;
  const { id } = req.params;

  const result = await runInRequestContext(authUser, async (t) => {
    const post = await findPostOr404(id, t);
    // A taken-down post is a 404 to everyone but its author and an admin —
    // the same rule the list queries apply through `visibleOnly`, restated
    // because fetching one row by id doesn't go through them.
    if (post.isRemoved && post.authorId !== authUser.id && authUser.role !== 'admin') {
      throw ApiError.notFound('Post not found');
    }
    const [serialized] = await serializePosts([post], authUser.id, t);
    return serialized;
  });

  res.json(result);
});

// ---------------------------------------------------------------------
// POST /feed/posts
//
// One endpoint, three shapes. The discriminated union is what makes the
// per-kind required fields real: a 'walkin' with no date or venue, or a
// 'job' with no way to apply, is a 400 rather than a post nobody can act on.
// ---------------------------------------------------------------------

/** Blank strings arrive from untouched form fields; they mean "not provided". */
const blankToUndefined = <T extends z.ZodTypeAny>(schema: T) =>
  z.preprocess((value) => (typeof value === 'string' && value.trim() === '' ? undefined : value), schema);

const baseFields = {
  title: z.string().trim().min(4, 'Give the post a title').max(180),
  body: blankToUndefined(z.string().trim().max(4000).optional()),
  imageLink: blankToUndefined(z.string().trim().url('Image link must be a URL').max(500).optional()),
};

const contactFields = {
  applyLink: blankToUndefined(z.string().trim().url('Apply link must be a URL').max(500).optional()),
  contactPerson: blankToUndefined(z.string().trim().max(180).optional()),
  contactEmail: blankToUndefined(z.string().trim().email('Enter a valid email').max(255).optional()),
  contactPhone: blankToUndefined(z.string().trim().min(6).max(20).optional()),
  whatsappLink: blankToUndefined(z.string().trim().url('WhatsApp link must be a URL').max(500).optional()),
};

const hiringFields = {
  companyName: z.string().trim().min(2, 'Which company is hiring?').max(180),
  roleTitle: z.string().trim().min(2, 'Which role is this for?').max(180),
  location: z.string().trim().min(2, 'Where is this?').max(180),
  qualification: z.string().trim().min(2, 'State the qualification required').max(255),
  experience: blankToUndefined(z.string().trim().max(180).optional()),
  salary: blankToUndefined(z.string().trim().max(180).optional()),
  postedOnBehalf: z.boolean().optional(),
};

// Plain ZodObjects, deliberately: z.discriminatedUnion only accepts objects,
// so a `.refine()` here would make the union throw at construction time. The
// cross-field "some way to contact them" rule is applied after parsing
// instead — see requireContact below.
const walkinSchema = z.object({
  kind: z.literal('walkin'),
  ...baseFields,
  ...hiringFields,
  ...contactFields,
  walkinDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Pick the date of the drive'),
  walkinStartTime: blankToUndefined(z.string().trim().max(40).optional()),
  walkinEndTime: blankToUndefined(z.string().trim().max(40).optional()),
  venue: z.string().trim().min(4, 'Give the full venue address').max(2000),
});

const jobSchema = z.object({
  kind: z.literal('job'),
  ...baseFields,
  ...hiringFields,
  ...contactFields,
});

const communityPostSchema = z.object({
  kind: z.literal('community'),
  ...baseFields,
  communityId: z.string().uuid('Pick a community to post in'),
});

const createPostSchema = z.discriminatedUnion('kind', [walkinSchema, jobSchema, communityPostSchema]);

type CreatePostBody = z.infer<typeof createPostSchema>;

/** At least one way for a candidate to actually reach the employer. */
function requireContact(body: Extract<CreatePostBody, { kind: 'walkin' | 'job' }>): void {
  if (body.applyLink || body.contactEmail || body.contactPhone || body.whatsappLink) return;
  throw ApiError.badRequest(
    'Add at least one way to reach you — an apply link, an email, a phone number or a WhatsApp link',
  );
}

export const createPost = asyncHandler(async (req: Request, res: Response) => {
  const authUser = req.user!;
  const body = createPostSchema.parse(req.body);
  const isCommunityPost = body.kind === 'community';
  if (!isCommunityPost) requireContact(body);

  const result = await runInRequestContext(authUser, async (t) => {
    if (body.kind === 'community') {
      // Posting into a community you have not joined is how a community feed
      // becomes a broadcast channel, so membership is checked, not assumed.
      const membership = await CommunityMember.findOne({
        where: { communityId: body.communityId, userId: authUser.id },
        transaction: t,
      });
      if (!membership) {
        throw ApiError.forbidden('Join this community before posting in it');
      }
    }

    const created = await FeedPost.create(
      {
        kind: body.kind,
        authorId: authUser.id,
        authorName: await resolveAuthorName(authUser.id, t),
        authorRole: authUser.role,
        communityId: body.kind === 'community' ? body.communityId : null,
        postedOnBehalf: body.kind === 'community' ? false : body.postedOnBehalf ?? false,
        title: body.title,
        body: body.body ?? null,
        imageLink: body.imageLink ?? null,
        companyName: body.kind === 'community' ? null : body.companyName,
        roleTitle: body.kind === 'community' ? null : body.roleTitle,
        location: body.kind === 'community' ? null : body.location,
        qualification: body.kind === 'community' ? null : body.qualification,
        experience: body.kind === 'community' ? null : body.experience ?? null,
        salary: body.kind === 'community' ? null : body.salary ?? null,
        walkinDate: body.kind === 'walkin' ? body.walkinDate : null,
        walkinStartTime: body.kind === 'walkin' ? body.walkinStartTime ?? null : null,
        walkinEndTime: body.kind === 'walkin' ? body.walkinEndTime ?? null : null,
        venue: body.kind === 'walkin' ? body.venue : null,
        applyLink: body.kind === 'community' ? null : body.applyLink ?? null,
        contactPerson: body.kind === 'community' ? null : body.contactPerson ?? null,
        contactEmail: body.kind === 'community' ? null : body.contactEmail ?? null,
        contactPhone: body.kind === 'community' ? null : body.contactPhone ?? null,
        whatsappLink: body.kind === 'community' ? null : body.whatsappLink ?? null,
      },
      { transaction: t },
    );

    const post = await findPostOr404(created.id, t);
    const [serialized] = await serializePosts([post], authUser.id, t);
    return serialized;
  });

  res.status(201).json(result);
});

// ---------------------------------------------------------------------
// DELETE /feed/posts/:id
// ---------------------------------------------------------------------

export const deletePost = asyncHandler(async (req: Request, res: Response) => {
  const authUser = req.user!;
  const { id } = req.params;

  await runInRequestContext(authUser, async (t) => {
    const post = await FeedPost.findByPk(id, { transaction: t });
    if (!post) throw ApiError.notFound('Post not found');
    if (post.authorId !== authUser.id && authUser.role !== 'admin') {
      throw ApiError.forbidden('You can only delete your own posts');
    }
    await post.destroy({ transaction: t });
  });

  res.status(204).send();
});

// ---------------------------------------------------------------------
// POST /feed/posts/:id/like — a toggle, not an increment
// ---------------------------------------------------------------------

export const toggleLike = asyncHandler(async (req: Request, res: Response) => {
  const authUser = req.user!;
  const { id } = req.params;

  const result = await runInRequestContext(authUser, async (t) => {
    const post = await FeedPost.findByPk(id, { transaction: t });
    if (!post) throw ApiError.notFound('Post not found');

    const existing = await PostReaction.findOne({
      where: { postId: id, userId: authUser.id },
      transaction: t,
    });

    if (existing) {
      await existing.destroy({ transaction: t });
    } else {
      await PostReaction.create({ postId: id, userId: authUser.id }, { transaction: t });
    }

    const likeCount = await PostReaction.count({ where: { postId: id }, transaction: t });
    return { likeCount, likedByMe: !existing };
  });

  res.json(result);
});

// ---------------------------------------------------------------------
// Discussion
// ---------------------------------------------------------------------

/**
 * The discussion under one post, as top-level comments each carrying their
 * own replies.
 *
 * Assembled in JS from one query rather than fetched per level: a thread is
 * capped at one level deep (see addComment), so the whole discussion is a
 * single `WHERE post_id = ?` and grouping it here costs nothing. A recursive
 * query would buy depth this feature does not have.
 */
export const listComments = asyncHandler(async (req: Request, res: Response) => {
  const authUser = req.user!;
  const { id } = req.params;

  const result = await runInRequestContext(authUser, async (t) => {
    const comments = await PostComment.findAll({
      where: { postId: id },
      order: [['createdAt', 'ASC']],
      transaction: t,
    });

    const commentIds = comments.map((comment) => comment.id);

    // Two queries for the like state, not one per comment: the counts for
    // everyone, and this reader's own rows to decide which hearts are filled.
    const reactions = commentIds.length
      ? await CommentReaction.findAll({
          where: { commentId: { [Op.in]: commentIds } },
          transaction: t,
        })
      : [];

    const likeCountByComment = new Map<string, number>();
    const likedByMe = new Set<string>();
    for (const reaction of reactions) {
      likeCountByComment.set(
        reaction.commentId,
        (likeCountByComment.get(reaction.commentId) ?? 0) + 1,
      );
      if (reaction.userId === authUser.id) likedByMe.add(reaction.commentId);
    }

    const toView = (comment: PostComment) => ({
      id: comment.id,
      body: comment.body,
      author: { id: comment.userId, name: comment.authorName, role: comment.authorRole },
      canDelete: comment.userId === authUser.id || authUser.role === 'admin',
      likeCount: likeCountByComment.get(comment.id) ?? 0,
      likedByMe: likedByMe.has(comment.id),
      createdAt: comment.createdAt,
    });

    const repliesByParent = new Map<string, ReturnType<typeof toView>[]>();
    for (const comment of comments) {
      if (!comment.parentCommentId) continue;
      const bucket = repliesByParent.get(comment.parentCommentId) ?? [];
      bucket.push(toView(comment));
      repliesByParent.set(comment.parentCommentId, bucket);
    }

    return comments
      .filter((comment) => !comment.parentCommentId)
      .map((comment) => ({
        ...toView(comment),
        replies: repliesByParent.get(comment.id) ?? [],
      }));
  });

  res.json(result);
});

const addCommentSchema = z.object({
  body: z.string().trim().min(1, 'Say something').max(2000),
  /** Answers this comment rather than the post. */
  parentCommentId: z.string().uuid().optional(),
});

export const addComment = asyncHandler(async (req: Request, res: Response) => {
  const authUser = req.user!;
  const { id } = req.params;
  const parsed = addCommentSchema.parse(req.body);

  const result = await runInRequestContext(authUser, async (t) => {
    const post = await FeedPost.findByPk(id, { transaction: t });
    if (!post) throw ApiError.notFound('Post not found');

    let parentCommentId: string | null = null;
    if (parsed.parentCommentId) {
      const parent = await PostComment.findByPk(parsed.parentCommentId, { transaction: t });
      if (!parent || parent.postId !== id) {
        throw ApiError.notFound('The comment you are replying to no longer exists');
      }
      // Flatten: replying to a reply attaches to the same top-level comment.
      // A drive's discussion is not improved by six levels of indentation,
      // and one level keeps "who is answering whom" legible on a phone.
      parentCommentId = parent.parentCommentId ?? parent.id;
    }

    const comment = await PostComment.create(
      {
        postId: id,
        userId: authUser.id,
        authorName: await resolveAuthorName(authUser.id, t),
        authorRole: authUser.role,
        body: parsed.body,
        parentCommentId,
      },
      { transaction: t },
    );
    const commentCount = await PostComment.count({ where: { postId: id }, transaction: t });
    return { id: comment.id, commentCount };
  });

  res.status(201).json(result);
});

/**
 * POST /feed/comments/:commentId/like — a toggle, exactly like toggleLike on
 * a post: the unique index is what makes a second click an un-like rather
 * than a second row.
 */
export const toggleCommentLike = asyncHandler(async (req: Request, res: Response) => {
  const authUser = req.user!;
  const { commentId } = req.params;

  const result = await runInRequestContext(authUser, async (t) => {
    const comment = await PostComment.findByPk(commentId, { transaction: t });
    if (!comment) throw ApiError.notFound('Comment not found');

    const existing = await CommentReaction.findOne({
      where: { commentId, userId: authUser.id },
      transaction: t,
    });

    if (existing) {
      await existing.destroy({ transaction: t });
    } else {
      await CommentReaction.create({ commentId, userId: authUser.id }, { transaction: t });
    }

    const likeCount = await CommentReaction.count({ where: { commentId }, transaction: t });
    return { likeCount, likedByMe: !existing };
  });

  res.json(result);
});

export const deleteComment = asyncHandler(async (req: Request, res: Response) => {
  const authUser = req.user!;
  const { commentId } = req.params;

  await runInRequestContext(authUser, async (t) => {
    const comment = await PostComment.findByPk(commentId, { transaction: t });
    if (!comment) throw ApiError.notFound('Comment not found');
    if (comment.userId !== authUser.id && authUser.role !== 'admin') {
      throw ApiError.forbidden('You can only delete your own comments');
    }
    await comment.destroy({ transaction: t });
  });

  res.status(204).send();
});

// ---------------------------------------------------------------------
// POST /feed/posts/:id/report — the "scam" button
//
// Also a toggle: flagging is a judgement people change their mind about, and
// a one-way button turns "I misread this" into a permanent accusation.
// ---------------------------------------------------------------------

const reportSchema = z.object({
  reason: z.string().trim().max(500).optional(),
});

export const toggleReport = asyncHandler(async (req: Request, res: Response) => {
  const authUser = req.user!;
  const { id } = req.params;
  const parsed = reportSchema.parse(req.body ?? {});

  const result = await runInRequestContext(authUser, async (t) => {
    const post = await FeedPost.findByPk(id, { transaction: t });
    if (!post) throw ApiError.notFound('Post not found');

    const existing = await PostReport.findOne({
      where: { postId: id, userId: authUser.id },
      transaction: t,
    });

    if (existing) {
      await existing.destroy({ transaction: t });
    } else {
      await PostReport.create(
        { postId: id, userId: authUser.id, reason: parsed.reason ?? null },
        { transaction: t },
      );
    }

    const scamCount = await PostReport.count({ where: { postId: id }, transaction: t });
    return { scamCount, reportedByMe: !existing };
  });

  res.json(result);
});

// ---------------------------------------------------------------------
// Communities
// ---------------------------------------------------------------------

export const listCommunities = asyncHandler(async (req: Request, res: Response) => {
  const authUser = req.user!;

  const result = await runInRequestContext(authUser, async (t) => {
    const communities = await Community.findAll({ order: [['name', 'ASC']], transaction: t });

    // The catalogue is a handful of rows, so the counts are tallied from two
    // full scans rather than a GROUP BY per community. Revisit if the
    // catalogue ever stops being small.
    const memberships = await CommunityMember.findAll({
      attributes: ['communityId', 'userId'],
      transaction: t,
    });
    const memberCounts = new Map<string, number>();
    const joined = new Set<string>();
    for (const row of memberships) {
      memberCounts.set(row.communityId, (memberCounts.get(row.communityId) ?? 0) + 1);
      if (row.userId === authUser.id) joined.add(row.communityId);
    }

    const posts = await FeedPost.findAll({
      where: { kind: 'community' },
      attributes: ['communityId'],
      transaction: t,
    });
    const postCounts = new Map<string, number>();
    for (const post of posts) {
      if (post.communityId) postCounts.set(post.communityId, (postCounts.get(post.communityId) ?? 0) + 1);
    }

    return communities.map((community) => ({
      id: community.id,
      slug: community.slug,
      name: community.name,
      description: community.description,
      icon: community.icon,
      memberCount: memberCounts.get(community.id) ?? 0,
      postCount: postCounts.get(community.id) ?? 0,
      joined: joined.has(community.id),
    }));
  });

  res.json(result);
});

async function findCommunityOr404(slug: string, t: Transaction): Promise<Community> {
  const community = await Community.findOne({ where: { slug }, transaction: t });
  if (!community) throw ApiError.notFound('Community not found');
  return community;
}

export const joinCommunity = asyncHandler(async (req: Request, res: Response) => {
  const authUser = req.user!;
  const { slug } = req.params;

  const result = await runInRequestContext(authUser, async (t) => {
    const community = await findCommunityOr404(slug, t);
    // findOrCreate rather than create: a double-tap on a slow connection is a
    // no-op, not a 500 from the unique index.
    await CommunityMember.findOrCreate({
      where: { communityId: community.id, userId: authUser.id },
      defaults: { communityId: community.id, userId: authUser.id },
      transaction: t,
    });
    const memberCount = await CommunityMember.count({
      where: { communityId: community.id },
      transaction: t,
    });
    return { joined: true, memberCount };
  });

  res.json(result);
});

export const leaveCommunity = asyncHandler(async (req: Request, res: Response) => {
  const authUser = req.user!;
  const { slug } = req.params;

  const result = await runInRequestContext(authUser, async (t) => {
    const community = await findCommunityOr404(slug, t);
    await CommunityMember.destroy({
      where: { communityId: community.id, userId: authUser.id },
      transaction: t,
    });
    const memberCount = await CommunityMember.count({
      where: { communityId: community.id },
      transaction: t,
    });
    return { joined: false, memberCount };
  });

  res.json(result);
});

/**
 * GET /communities/:slug/posts — one community's feed.
 *
 * Readable without joining. Joining is what puts a community in your own list
 * and lets you post in it; making the content itself members-only would mean
 * deciding whether to join a community you cannot see.
 */
export const listCommunityPosts = asyncHandler(async (req: Request, res: Response) => {
  const authUser = req.user!;
  const { slug } = req.params;
  const query = listQuerySchema.parse(req.query);
  const { page, limit } = parsePaging(query);

  const result = await runInRequestContext(authUser, async (t) => {
    const community = await findCommunityOr404(slug, t);

    const conditions: WhereOptions[] = [{ kind: 'community', communityId: community.id }, visibleOnly];
    if (query.q) conditions.push(contains('title', query.q));
    const where = { [Op.and]: conditions };

    const posts = (await FeedPost.findAll({
      where,
      include: postIncludes,
      order: [['createdAt', 'DESC']],
      limit,
      offset: (page - 1) * limit,
      transaction: t,
    })) as PostWithRelations[];

    const totalCount = await FeedPost.count({ where, transaction: t });
    const memberCount = await CommunityMember.count({
      where: { communityId: community.id },
      transaction: t,
    });
    const membership = await CommunityMember.findOne({
      where: { communityId: community.id, userId: authUser.id },
      transaction: t,
    });

    return {
      community: {
        id: community.id,
        slug: community.slug,
        name: community.name,
        description: community.description,
        icon: community.icon,
        memberCount,
        joined: Boolean(membership),
      },
      results: await serializePosts(posts, authUser.id, t),
      page,
      limit,
      totalCount,
    };
  });

  res.json(result);
});

/**
 * GET /communities/me/feed — everything from the communities you have joined,
 * newest first. The landing view of the Community tab once you belong to at
 * least one.
 */
export const listMyCommunityFeed = asyncHandler(async (req: Request, res: Response) => {
  const authUser = req.user!;
  const query = listQuerySchema.parse(req.query);
  const { page, limit } = parsePaging(query);

  const result = await runInRequestContext(authUser, async (t) => {
    const memberships = await CommunityMember.findAll({
      where: { userId: authUser.id },
      attributes: ['communityId'],
      transaction: t,
    });
    const communityIds = memberships.map((row) => row.communityId);

    if (communityIds.length === 0) {
      return { results: [], page, limit, totalCount: 0 };
    }

    const where = { kind: 'community' as const, communityId: { [Op.in]: communityIds }, isRemoved: false };

    const posts = (await FeedPost.findAll({
      where,
      include: postIncludes,
      order: [['createdAt', 'DESC']],
      limit,
      offset: (page - 1) * limit,
      transaction: t,
    })) as PostWithRelations[];

    const totalCount = await FeedPost.count({ where, transaction: t });

    return { results: await serializePosts(posts, authUser.id, t), page, limit, totalCount };
  });

  res.json(result);
});
