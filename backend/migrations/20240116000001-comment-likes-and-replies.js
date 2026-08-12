'use strict';

/**
 * Likes and replies on comments.
 *
 * A post could be liked and could be discussed, but a *comment* could only be
 * written and deleted. So the discussion under a drive was a flat wall of
 * remarks with no way to agree with one ("did anyone actually get shortlisted
 * here?" answered five times because nobody could see the existing answer had
 * been endorsed) and no way to answer one in particular — every reply was
 * addressed to the post, and readers had to infer who was talking to whom
 * from the wording.
 *
 * Two additions, both minimal:
 *
 *   comment_reactions   the exact shape of post_reactions, including the
 *                       one-row-per-user unique index that makes the endpoint
 *                       a toggle rather than a counter anyone can inflate.
 *
 *   post_comments.parent_comment_id
 *                       a self-reference, nullable. NULL is a top-level
 *                       comment; set means a reply to that comment.
 *
 * Depth is deliberately capped at one in the controller rather than here: a
 * self-FK permits arbitrary nesting, but a drive's discussion thread is not a
 * place that benefits from six levels of indentation, and a reply-to-a-reply
 * is attached to the same top-level comment instead. That is a product rule,
 * so it lives in feedController where it can be read alongside the endpoint,
 * not in a CHECK constraint that would make it a migration to change.
 *
 * ON DELETE CASCADE on the self-reference: deleting a comment takes its
 * replies with it. The alternative — orphaned replies re-parented to the top
 * level — leaves answers to a question that is no longer on screen.
 *
 * Purely additive. No existing column is altered or dropped.
 */

const admin = `current_setting('app.current_user_role', true) = 'admin'`;
const selfId = `current_setting('app.current_user_id', true)::uuid`;

module.exports = {
  up: async (queryInterface, Sequelize) => {
    const { DataTypes, literal } = Sequelize;
    const query = (sql) => queryInterface.sequelize.query(sql);

    // ---------------------------------------------------------------
    // post_comments.parent_comment_id
    // ---------------------------------------------------------------
    await queryInterface.addColumn('post_comments', 'parent_comment_id', {
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: 'post_comments', key: 'id' },
      onDelete: 'CASCADE',
    });

    // Replies are always fetched as "everything under this parent", so the
    // index leads with the parent and orders within it.
    await query(`
      CREATE INDEX post_comments_parent_created_at
        ON post_comments (parent_comment_id, created_at);
    `);

    // ---------------------------------------------------------------
    // comment_reactions
    // ---------------------------------------------------------------
    await queryInterface.createTable('comment_reactions', {
      id: {
        type: DataTypes.UUID,
        primaryKey: true,
        allowNull: false,
        defaultValue: literal('gen_random_uuid()'),
      },
      comment_id: {
        type: DataTypes.UUID,
        allowNull: false,
        references: { model: 'post_comments', key: 'id' },
        onDelete: 'CASCADE',
      },
      user_id: {
        type: DataTypes.UUID,
        allowNull: false,
        references: { model: 'users', key: 'id' },
        onDelete: 'CASCADE',
      },
      created_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: literal('now()'),
      },
    });

    await query(`
      CREATE UNIQUE INDEX comment_reactions_unique
        ON comment_reactions (comment_id, user_id);
    `);

    // ---------------------------------------------------------------
    // RLS — the same three-policy shape post_reactions has: everyone reads
    // the counts, you may only write your own row, admins may moderate.
    // ---------------------------------------------------------------
    await query(`ALTER TABLE comment_reactions ENABLE ROW LEVEL SECURITY;`);
    await query(`ALTER TABLE comment_reactions FORCE ROW LEVEL SECURITY;`);

    await query(`
      CREATE POLICY comment_reactions_select_all ON comment_reactions
        FOR SELECT USING (true);
    `);
    await query(`
      CREATE POLICY comment_reactions_own ON comment_reactions
        FOR ALL USING (user_id = ${selfId}) WITH CHECK (user_id = ${selfId});
    `);
    await query(`
      CREATE POLICY comment_reactions_admin ON comment_reactions
        FOR ALL USING (${admin}) WITH CHECK (${admin});
    `);
  },

  down: async (queryInterface) => {
    const query = (sql) => queryInterface.sequelize.query(sql);

    await queryInterface.dropTable('comment_reactions');
    await query(`DROP INDEX IF EXISTS post_comments_parent_created_at;`);
    await queryInterface.removeColumn('post_comments', 'parent_comment_id');
  },
};
