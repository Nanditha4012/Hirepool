'use strict';

/**
 * Social module: Walk-in Pedia, Job Book and Communities.
 *
 * Three surfaces, one table. A walk-in listing, a Job Book post and a
 * community post are all "something a user published that other users can
 * like, discuss and report as a scam" — the only real difference is which
 * subset of columns is filled in and which screen lists it. Splitting them
 * into three tables would mean three copies of the reactions/comments/reports
 * machinery (and a polymorphic `target_type` on each of those anyway), so
 * `feed_posts.kind` carries the distinction instead and the kind-specific
 * columns are simply nullable. The controller's zod schemas are what make
 * "a walk-in must say when and where" a real rule — see feedController.ts.
 *
 * Follows the conventions of the earlier phase migrations exactly: idempotent
 * `DO $$ ... EXCEPTION WHEN duplicate_object` enum creation, the
 * uuidPk/createdAtNow helpers, and the `admin`/`selfId` RLS session-variable
 * helpers from 20240101000004-enable-rls-and-policies.js.
 *
 * Purely additive: no existing table or column is altered or dropped.
 */

const admin = `current_setting('app.current_user_role', true) = 'admin'`;
const selfId = `current_setting('app.current_user_id', true)::uuid`;

const ENUM_TYPES = [
  // 'walkin' and 'job' are the two tabs of the Walk-in Pedia / Job Book
  // screen; 'community' is a post inside a joined community. A community post
  // carries community_id and none of the drive/vacancy columns.
  { name: 'feed_post_kind', values: ['walkin', 'job', 'community'] },
];

const TABLES = [
  'communities',
  'community_members',
  'feed_posts',
  'post_reactions',
  'post_comments',
  'post_reports',
];

module.exports = {
  up: async (queryInterface, Sequelize) => {
    const { DataTypes, literal } = Sequelize;
    const query = (sql) => queryInterface.sequelize.query(sql);

    const uuidPk = {
      type: DataTypes.UUID,
      primaryKey: true,
      allowNull: false,
      defaultValue: literal('gen_random_uuid()'),
    };
    const createdAtNow = {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: literal('now()'),
    };
    const authorRef = {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'users', key: 'id' },
      onDelete: 'CASCADE',
    };

    for (const enumType of ENUM_TYPES) {
      const valuesSql = enumType.values.map((v) => `'${v}'`).join(', ');
      await query(`
        DO $$ BEGIN
          CREATE TYPE ${enumType.name} AS ENUM (${valuesSql});
        EXCEPTION
          WHEN duplicate_object THEN NULL;
        END $$;
      `);
    }

    // ---------------------------------------------------------------
    // communities
    //
    // Admin-curated, not user-created: the product is "pick a community and
    // join it", so the list is a small fixed catalogue (seeded alongside this
    // migration) rather than something every user can add to. That is
    // enforced by RLS below, not just by the absence of a create endpoint.
    // ---------------------------------------------------------------
    await queryInterface.createTable('communities', {
      id: uuidPk,
      slug: { type: DataTypes.STRING, allowNull: false, unique: true },
      name: { type: DataTypes.STRING, allowNull: false },
      description: { type: DataTypes.TEXT, allowNull: true },
      // A single emoji. Keeps the catalogue self-illustrating without an
      // upload pipeline or an icon dependency.
      icon: { type: DataTypes.STRING, allowNull: true },
      created_at: createdAtNow,
      updated_at: createdAtNow,
    });

    // ---------------------------------------------------------------
    // community_members
    // ---------------------------------------------------------------
    await queryInterface.createTable('community_members', {
      id: uuidPk,
      community_id: {
        type: DataTypes.UUID,
        allowNull: false,
        references: { model: 'communities', key: 'id' },
        onDelete: 'CASCADE',
      },
      user_id: authorRef,
      created_at: createdAtNow,
    });
    await query(`
      CREATE UNIQUE INDEX community_members_unique
        ON community_members (community_id, user_id);
    `);

    // ---------------------------------------------------------------
    // feed_posts
    // ---------------------------------------------------------------
    await queryInterface.createTable('feed_posts', {
      id: uuidPk,
      kind: { type: 'feed_post_kind', allowNull: false },
      author_id: authorRef,
      // Who to show as the author, recorded at publish time.
      //
      // Not a join to `users`. The RLS on that table (see
      // 20240101000004-enable-rls-and-policies.js) lets a signed-in user
      // select their OWN row and nothing else — deliberately — so joining it
      // from a public feed returns a name for exactly one post on the page
      // and NULL for every other. The alternatives were to widen
      // users_select_* so anyone can read anyone (a real loosening of an
      // existing boundary, for a cosmetic label) or to record the name here.
      //
      // Recording it is also the more correct model: a post is a published
      // artefact, and it should say who published it at the time. The cost is
      // that renaming an account does not rewrite its old posts, which is the
      // normal behaviour for a feed.
      author_name: { type: DataTypes.STRING, allowNull: false },
      // 'candidate' | 'company' | 'verifier' | 'admin'. Plain text, not the
      // user_role enum, because it is a display label here rather than a
      // permission — and unlike a name, a role does not change under an
      // account, so this stays accurate.
      author_role: { type: DataTypes.STRING, allowNull: false },
      // Set iff kind = 'community'.
      community_id: {
        type: DataTypes.UUID,
        allowNull: true,
        references: { model: 'communities', key: 'id' },
        onDelete: 'CASCADE',
      },
      // A candidate may post a drive they heard about on a company's behalf.
      // The author is still the candidate (so moderation and edit rights are
      // unambiguous) — this flag is what the card renders as "posted by a
      // candidate, not by the company" so nobody reads it as official.
      posted_on_behalf: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },

      title: { type: DataTypes.STRING, allowNull: false },
      body: { type: DataTypes.TEXT, allowNull: true },

      // --- walk-in / job shared: who is hiring, for what ---
      company_name: { type: DataTypes.STRING, allowNull: true },
      role_title: { type: DataTypes.STRING, allowNull: true },
      location: { type: DataTypes.STRING, allowNull: true },
      // Free text on purpose — "Any degree", "B.E / B.Tech (CSE, IT)",
      // "B.Sc + 60% throughout" are all things a real drive asks for, and no
      // enum survives contact with that.
      qualification: { type: DataTypes.STRING, allowNull: true },
      experience: { type: DataTypes.STRING, allowNull: true },
      salary: { type: DataTypes.STRING, allowNull: true },

      // --- walk-in only: when and where ---
      // DATEONLY, not a timestamp: a drive happens on a calendar day in the
      // venue's own city, and the today/upcoming/over grouping is a
      // calendar-day question. Storing an instant would drag timezone
      // conversion into that comparison for no gain.
      walkin_date: { type: DataTypes.DATEONLY, allowNull: true },
      walkin_start_time: { type: DataTypes.STRING, allowNull: true },
      walkin_end_time: { type: DataTypes.STRING, allowNull: true },
      venue: { type: DataTypes.TEXT, allowNull: true },

      // --- how to reach them ---
      apply_link: { type: DataTypes.STRING, allowNull: true },
      contact_person: { type: DataTypes.STRING, allowNull: true },
      contact_email: { type: DataTypes.STRING, allowNull: true },
      contact_phone: { type: DataTypes.STRING, allowNull: true },
      whatsapp_link: { type: DataTypes.STRING, allowNull: true },

      // Community memes and job posters.
      image_link: { type: DataTypes.STRING, allowNull: true },

      // Soft delete, for admin moderation. RLS hides removed rows from
      // everyone except an admin, so a takedown is reversible and the
      // evidence behind a scam report survives it.
      is_removed: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },

      created_at: createdAtNow,
      updated_at: createdAtNow,
    });
    // The walk-in screen's only ordering key. Partial, because two of the
    // three kinds never set walkin_date.
    await query(`
      CREATE INDEX feed_posts_walkin_date
        ON feed_posts (walkin_date)
        WHERE kind = 'walkin';
    `);
    await query(`CREATE INDEX feed_posts_kind_created_at ON feed_posts (kind, created_at DESC);`);
    await query(`CREATE INDEX feed_posts_community_created_at ON feed_posts (community_id, created_at DESC);`);
    await query(`CREATE INDEX feed_posts_author ON feed_posts (author_id);`);

    // ---------------------------------------------------------------
    // post_reactions — the "like" button. One row per user per post; the
    // unique index is what makes the endpoint a toggle rather than a counter
    // anyone can inflate by clicking twice.
    // ---------------------------------------------------------------
    await queryInterface.createTable('post_reactions', {
      id: uuidPk,
      post_id: {
        type: DataTypes.UUID,
        allowNull: false,
        references: { model: 'feed_posts', key: 'id' },
        onDelete: 'CASCADE',
      },
      user_id: authorRef,
      created_at: createdAtNow,
    });
    await query(`CREATE UNIQUE INDEX post_reactions_unique ON post_reactions (post_id, user_id);`);

    // ---------------------------------------------------------------
    // post_comments — the "discussion" thread under a post.
    // ---------------------------------------------------------------
    await queryInterface.createTable('post_comments', {
      id: uuidPk,
      post_id: {
        type: DataTypes.UUID,
        allowNull: false,
        references: { model: 'feed_posts', key: 'id' },
        onDelete: 'CASCADE',
      },
      user_id: authorRef,
      // Snapshot, for the same reason as feed_posts.author_name above.
      author_name: { type: DataTypes.STRING, allowNull: false },
      author_role: { type: DataTypes.STRING, allowNull: false },
      body: { type: DataTypes.TEXT, allowNull: false },
      created_at: createdAtNow,
    });
    await query(`CREATE INDEX post_comments_post_created_at ON post_comments (post_id, created_at);`);

    // ---------------------------------------------------------------
    // post_reports — the "scam" button. Same one-per-user shape as a
    // reaction, so the count is a number of distinct people rather than a
    // number of clicks.
    // ---------------------------------------------------------------
    await queryInterface.createTable('post_reports', {
      id: uuidPk,
      post_id: {
        type: DataTypes.UUID,
        allowNull: false,
        references: { model: 'feed_posts', key: 'id' },
        onDelete: 'CASCADE',
      },
      user_id: authorRef,
      reason: { type: DataTypes.TEXT, allowNull: true },
      created_at: createdAtNow,
    });
    await query(`CREATE UNIQUE INDEX post_reports_unique ON post_reports (post_id, user_id);`);

    // ---------------------------------------------------------------
    // RLS
    // ---------------------------------------------------------------
    for (const table of TABLES) {
      await query(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY;`);
      await query(`ALTER TABLE ${table} FORCE ROW LEVEL SECURITY;`);
    }

    // communities: a public catalogue everyone reads and only an admin writes.
    await query(`CREATE POLICY communities_select_all ON communities FOR SELECT USING (true);`);
    await query(`
      CREATE POLICY communities_admin ON communities FOR ALL
        USING (${admin})
        WITH CHECK (${admin});
    `);

    // community_members: membership is public (it is what the "1.2k members"
    // count is computed from), but you may only join/leave as yourself.
    await query(`CREATE POLICY community_members_select_all ON community_members FOR SELECT USING (true);`);
    await query(`
      CREATE POLICY community_members_own ON community_members FOR ALL
        USING (user_id = ${selfId})
        WITH CHECK (user_id = ${selfId});
    `);
    await query(`
      CREATE POLICY community_members_admin ON community_members FOR ALL
        USING (${admin})
        WITH CHECK (${admin});
    `);

    // feed_posts: every signed-in role reads the feed — a walk-in is no use
    // to a candidate who cannot see it, and a company wants to see what is
    // being posted about them. Writes are the author's own.
    await query(`CREATE POLICY feed_posts_select_visible ON feed_posts FOR SELECT USING (is_removed = false);`);
    await query(`
      CREATE POLICY feed_posts_own ON feed_posts FOR ALL
        USING (author_id = ${selfId})
        WITH CHECK (author_id = ${selfId});
    `);
    await query(`
      CREATE POLICY feed_posts_admin ON feed_posts FOR ALL
        USING (${admin})
        WITH CHECK (${admin});
    `);

    // post_reactions / post_comments: counts and threads are public, rows are
    // owned. Deliberately not restricted to posts that are still visible —
    // hiding a removed post's comments is the SELECT policy on feed_posts
    // doing its job one level up, and duplicating that condition here would
    // mean two places to keep in sync.
    for (const table of ['post_reactions', 'post_comments']) {
      await query(`CREATE POLICY ${table}_select_all ON ${table} FOR SELECT USING (true);`);
      await query(`
        CREATE POLICY ${table}_own ON ${table} FOR ALL
          USING (user_id = ${selfId})
          WITH CHECK (user_id = ${selfId});
      `);
      await query(`
        CREATE POLICY ${table}_admin ON ${table} FOR ALL
          USING (${admin})
          WITH CHECK (${admin});
      `);
    }

    // post_reports: the "N people flagged this as a scam" warning is the
    // whole point of the button, so the rows have to be countable by every
    // viewer — hence SELECT true, not owner-only.
    //
    // That does mean the reporter's user_id sits in a row anyone may read.
    // RLS is row-level, not column-level, so it cannot hide one column from a
    // role allowed to read the row, and withholding it is therefore the
    // controller's job: feedController never serialises `user_id` from this
    // table for a non-admin, and there is no endpoint that lists reporters.
    // Called out here for the same reason contest_questions.hidden_test_cases
    // is — the usual "RLS is the real guard" reasoning does not apply to this
    // one field.
    await query(`CREATE POLICY post_reports_select_all ON post_reports FOR SELECT USING (true);`);
    await query(`
      CREATE POLICY post_reports_own ON post_reports FOR ALL
        USING (user_id = ${selfId})
        WITH CHECK (user_id = ${selfId});
    `);
    await query(`
      CREATE POLICY post_reports_admin ON post_reports FOR ALL
        USING (${admin})
        WITH CHECK (${admin});
    `);
  },

  down: async (queryInterface) => {
    const query = (sql) => queryInterface.sequelize.query(sql);

    // Child-first, so the FK references drop cleanly.
    await queryInterface.dropTable('post_reports');
    await queryInterface.dropTable('post_comments');
    await queryInterface.dropTable('post_reactions');
    await queryInterface.dropTable('feed_posts');
    await queryInterface.dropTable('community_members');
    await queryInterface.dropTable('communities');

    for (const enumType of ENUM_TYPES) {
      await query(`DROP TYPE IF EXISTS ${enumType.name};`);
    }
  },
};
