import { Transaction } from 'sequelize';
import { sequelize } from '../config/database';

const VALID_ROLES = ['candidate', 'company', 'verifier', 'admin'] as const;
type ValidRole = (typeof VALID_ROLES)[number];

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface RequestContextUser {
  id: string;
  role: string;
}

function isValidUuid(value: string): boolean {
  return UUID_REGEX.test(value);
}

function isValidRole(value: string): value is ValidRole {
  return (VALID_ROLES as readonly string[]).includes(value);
}

/**
 * Opens a Sequelize transaction, sets the Postgres session-local GUCs that
 * the RLS policies in migrations/20240101000004-enable-rls-and-policies.js
 * read (`app.current_user_id` / `app.current_user_role`), then runs `work`
 * inside that same transaction. Pass `user: null` for unauthenticated
 * requests (e.g. registration, public master-data reads) — both GUCs are
 * simply left unset, which the policies treat as NULL.
 *
 * `SET LOCAL` does not accept bind parameters in Postgres, so the id/role
 * are validated (UUID shape, fixed role whitelist) and then interpolated
 * directly into the SQL string. Anything that fails validation throws
 * before any SQL is sent.
 */
export async function runInRequestContext<T>(
  user: RequestContextUser | null,
  work: (t: Transaction) => Promise<T>,
): Promise<T> {
  return sequelize.transaction(async (t) => {
    if (user) {
      if (!isValidUuid(user.id)) {
        throw new Error(`runInRequestContext: invalid user id "${user.id}"`);
      }
      if (!isValidRole(user.role)) {
        throw new Error(`runInRequestContext: invalid user role "${user.role}"`);
      }

      await sequelize.query(`SET LOCAL app.current_user_id = '${user.id}'`, { transaction: t });
      await sequelize.query(`SET LOCAL app.current_user_role = '${user.role}'`, { transaction: t });
    }

    return work(t);
  });
}
