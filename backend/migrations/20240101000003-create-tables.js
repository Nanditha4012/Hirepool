'use strict';

/**
 * Creates all 13 application tables. Columns typed against the native enum
 * types created in the previous migration are declared with a plain string
 * type name (e.g. `'user_role'`) rather than `Sequelize.DataTypes.ENUM(...)`,
 * since the latter would attempt to create its own (differently-named)
 * Postgres enum type. Column/table names match the snake_case `field`
 * mappings used by the corresponding Sequelize models in `src/models/`.
 *
 * Tables are created in FK-dependency order and dropped in reverse order in
 * `down`.
 */
module.exports = {
  up: async (queryInterface, Sequelize) => {
    const { DataTypes, literal } = Sequelize;
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
    const updatedAtNow = {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: literal('now()'),
    };

    // 1. users
    await queryInterface.createTable('users', {
      id: uuidPk,
      role: { type: 'user_role', allowNull: false },
      email: { type: DataTypes.STRING, allowNull: false, unique: true },
      password_hash: { type: DataTypes.STRING, allowNull: true },
      google_id: { type: DataTypes.STRING, allowNull: true, unique: true },
      phone: { type: DataTypes.STRING, allowNull: true },
      created_at: createdAtNow,
    });

    // 2. candidate_profiles
    await queryInterface.createTable('candidate_profiles', {
      id: uuidPk,
      user_id: {
        type: DataTypes.UUID,
        allowNull: false,
        unique: true,
        references: { model: 'users', key: 'id' },
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE',
      },
      category: { type: 'candidate_category', allowNull: true },
      status: { type: 'candidate_status', allowNull: false, defaultValue: 'draft' },
      created_at: createdAtNow,
      updated_at: updatedAtNow,
    });

    // 3. company_profiles
    await queryInterface.createTable('company_profiles', {
      id: uuidPk,
      user_id: {
        type: DataTypes.UUID,
        allowNull: false,
        unique: true,
        references: { model: 'users', key: 'id' },
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE',
      },
      company_name: { type: DataTypes.STRING, allowNull: false },
      domain: { type: DataTypes.STRING, allowNull: true },
      verified: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      created_at: createdAtNow,
      updated_at: updatedAtNow,
    });

    // 4. verification_logs
    await queryInterface.createTable('verification_logs', {
      id: uuidPk,
      reviewer_id: {
        type: DataTypes.UUID,
        allowNull: false,
        references: { model: 'users', key: 'id' },
        onUpdate: 'CASCADE',
      },
      target_type: { type: 'verification_target_type', allowNull: false },
      target_id: { type: DataTypes.UUID, allowNull: false },
      decision: { type: 'verification_decision', allowNull: false },
      notes: { type: DataTypes.TEXT, allowNull: true },
      created_at: createdAtNow,
    });

    // 5. admin_audit_logs
    await queryInterface.createTable('admin_audit_logs', {
      id: uuidPk,
      admin_id: {
        type: DataTypes.UUID,
        allowNull: false,
        references: { model: 'users', key: 'id' },
        onUpdate: 'CASCADE',
      },
      action: { type: DataTypes.STRING, allowNull: false },
      target: { type: DataTypes.STRING, allowNull: true },
      created_at: createdAtNow,
    });

    // 6. roles_master
    await queryInterface.createTable('roles_master', {
      id: uuidPk,
      role_name: { type: DataTypes.STRING, allowNull: false, unique: true },
    });

    // 7. platform_badges_master
    await queryInterface.createTable('platform_badges_master', {
      id: uuidPk,
      platform_name: { type: DataTypes.STRING, allowNull: false },
      badge_name: { type: DataTypes.STRING, allowNull: false },
      sort_order: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    });

    // 8. companies_master
    await queryInterface.createTable('companies_master', {
      id: uuidPk,
      company_name: { type: DataTypes.STRING, allowNull: false, unique: true },
      is_mnc: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      is_faang_maang: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    });

    // 9. messages
    await queryInterface.createTable('messages', {
      id: uuidPk,
      company_id: {
        type: DataTypes.UUID,
        allowNull: false,
        references: { model: 'users', key: 'id' },
        onUpdate: 'CASCADE',
      },
      candidate_id: {
        type: DataTypes.UUID,
        allowNull: false,
        references: { model: 'users', key: 'id' },
        onUpdate: 'CASCADE',
      },
      sender_role: { type: 'message_sender_role', allowNull: false },
      body: { type: DataTypes.TEXT, allowNull: false },
      created_at: createdAtNow,
      read_at: { type: DataTypes.DATE, allowNull: true },
    });

    // 10. notifications
    await queryInterface.createTable('notifications', {
      id: uuidPk,
      user_id: {
        type: DataTypes.UUID,
        allowNull: false,
        references: { model: 'users', key: 'id' },
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE',
      },
      type: { type: DataTypes.STRING, allowNull: false },
      message: { type: DataTypes.TEXT, allowNull: false },
      link: { type: DataTypes.STRING, allowNull: true },
      created_at: createdAtNow,
      read_at: { type: DataTypes.DATE, allowNull: true },
    });

    // 11. candidate_platform_badges
    await queryInterface.createTable('candidate_platform_badges', {
      id: uuidPk,
      candidate_id: {
        type: DataTypes.UUID,
        allowNull: false,
        references: { model: 'users', key: 'id' },
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE',
      },
      platform_name: { type: DataTypes.STRING, allowNull: false },
      badge_selected: { type: DataTypes.STRING, allowNull: false },
      platform_profile_link: { type: DataTypes.STRING, allowNull: false },
      verification_status: {
        type: 'badge_verification_status',
        allowNull: false,
        defaultValue: 'pending',
      },
      rejection_reason: { type: DataTypes.TEXT, allowNull: true },
      created_at: createdAtNow,
      updated_at: updatedAtNow,
    });

    // 12. candidate_achievements
    await queryInterface.createTable('candidate_achievements', {
      id: uuidPk,
      candidate_id: {
        type: DataTypes.UUID,
        allowNull: false,
        references: { model: 'users', key: 'id' },
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE',
      },
      type: { type: 'achievement_type', allowNull: false },
      title: { type: DataTypes.STRING, allowNull: false },
      description: { type: DataTypes.TEXT, allowNull: true },
      links: { type: DataTypes.TEXT, allowNull: true },
      certificate_or_proof_link: { type: DataTypes.STRING, allowNull: false },
      verification_status: {
        type: 'achievement_verification_status',
        allowNull: false,
        defaultValue: 'pending',
      },
      rejection_reason: { type: DataTypes.TEXT, allowNull: true },
      created_at: createdAtNow,
    });

    // 13. user_totp_secrets
    await queryInterface.createTable('user_totp_secrets', {
      user_id: {
        type: DataTypes.UUID,
        primaryKey: true,
        allowNull: false,
        references: { model: 'users', key: 'id' },
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE',
      },
      secret: { type: DataTypes.STRING, allowNull: false },
      enabled_at: { type: DataTypes.DATE, allowNull: true },
    });
  },

  down: async (queryInterface) => {
    await queryInterface.dropTable('user_totp_secrets');
    await queryInterface.dropTable('candidate_achievements');
    await queryInterface.dropTable('candidate_platform_badges');
    await queryInterface.dropTable('notifications');
    await queryInterface.dropTable('messages');
    await queryInterface.dropTable('companies_master');
    await queryInterface.dropTable('platform_badges_master');
    await queryInterface.dropTable('roles_master');
    await queryInterface.dropTable('admin_audit_logs');
    await queryInterface.dropTable('verification_logs');
    await queryInterface.dropTable('company_profiles');
    await queryInterface.dropTable('candidate_profiles');
    await queryInterface.dropTable('users');
  },
};
