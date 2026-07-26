/**
 * Automated Phase 1 verification — the database/RLS half of the deliverables
 * checklist.
 *
 * The checklist items "a candidate account cannot read another candidate's row"
 * and "a company account cannot see any candidate's phone/email" are assertions
 * about the *database*, not about the UI, so clicking around the app can't
 * actually prove them. This script proves them the only way that counts: it
 * creates throwaway users, opens real Postgres sessions as each role (the same
 * `SET LOCAL app.current_user_id / app.current_user_role` mechanism the Express
 * layer uses), and asserts what each session can and cannot see.
 *
 * Everything it creates is removed again at the end, including on failure.
 *
 * Run with:  npm run verify:phase1
 */
import 'dotenv/config';
import { Client } from 'pg';

const REQUIRED_TABLES = [
  'users',
  'candidate_profiles',
  'company_profiles',
  'verification_logs',
  'admin_audit_logs',
  'roles_master',
  'platform_badges_master',
  'companies_master',
  'messages',
  'notifications',
  'candidate_platform_badges',
  'candidate_achievements',
];

interface Check {
  name: string;
  ok: boolean;
  detail: string;
}

const checks: Check[] = [];

function record(name: string, ok: boolean, detail = ''): void {
  checks.push({ name, ok, detail });
  const label = ok ? '[32mPASS[0m' : '[31mFAIL[0m';
  console.log(`  ${label}  ${name}${detail ? `\n          ${detail}` : ''}`);
}

function section(title: string): void {
  console.log(`\n[1m${title}[0m`);
}

/**
 * Runs `work` inside a transaction whose Postgres session variables identify
 * the given user/role — i.e. exactly what an authenticated API request looks
 * like to the RLS policies. Always rolled back, so these probes never mutate.
 */
async function asRole<T>(
  client: Client,
  user: { id: string; role: string } | null,
  work: () => Promise<T>,
): Promise<T> {
  await client.query('BEGIN');
  try {
    if (user) {
      await client.query(`SET LOCAL app.current_user_id = '${user.id}'`);
      await client.query(`SET LOCAL app.current_user_role = '${user.role}'`);
    }
    return await work();
  } finally {
    await client.query('ROLLBACK');
  }
}

async function countAs(
  client: Client,
  user: { id: string; role: string } | null,
  sql: string,
  params: unknown[] = [],
): Promise<number> {
  return asRole(client, user, async () => {
    const res = await client.query(sql, params as never[]);
    return res.rowCount ?? 0;
  });
}

async function main(): Promise<void> {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { require: true, rejectUnauthorized: false },
  });
  await client.connect();

  const stamp = Date.now();
  const emails = {
    candA: `verify.cand.a.${stamp}@example.test`,
    candB: `verify.cand.b.${stamp}@example.test`,
    company: `verify.company.${stamp}@example.test`,
    verifier: `verify.verifier.${stamp}@example.test`,
    admin: `verify.admin.${stamp}@example.test`,
  };

  try {
    // ---------------------------------------------------------------- schema
    section('Schema & seed data');

    const tableRows = await client.query<{ tablename: string; rowsecurity: boolean }>(
      `select tablename, rowsecurity from pg_tables where schemaname = 'public'`,
    );
    const present = new Map(tableRows.rows.map((r) => [r.tablename, r.rowsecurity]));

    const missing = REQUIRED_TABLES.filter((t) => !present.has(t));
    record(
      `all ${REQUIRED_TABLES.length} spec tables exist`,
      missing.length === 0,
      missing.length ? `missing: ${missing.join(', ')}` : REQUIRED_TABLES.join(', '),
    );

    const rlsOff = REQUIRED_TABLES.filter((t) => present.has(t) && !present.get(t));
    record('RLS enabled on every table', rlsOff.length === 0, rlsOff.length ? `not enabled: ${rlsOff.join(', ')}` : '');

    const notForced = await client.query<{ relname: string }>(
      `select relname from pg_class
       where relnamespace = 'public'::regnamespace and relkind = 'r'
         and relforcerowsecurity = false and relname = any($1)`,
      [REQUIRED_TABLES],
    );
    record(
      'RLS FORCED on every table (owner does not bypass)',
      notForced.rowCount === 0,
      notForced.rowCount ? `not forced: ${notForced.rows.map((r) => r.relname).join(', ')}` : '',
    );

    const roleCount = (await client.query<{ n: string }>('select count(*) n from roles_master')).rows[0].n;
    record('roles_master seeded with 100+ roles', Number(roleCount) >= 100, `${roleCount} rows`);

    const badges = await client.query<{ platform_name: string; n: string }>(
      'select platform_name, count(*) n from platform_badges_master group by 1 order by 1',
    );
    record(
      'platform_badges_master seeded per platform',
      badges.rowCount !== null && badges.rowCount > 0,
      badges.rows.map((r) => `${r.platform_name}=${r.n}`).join(', '),
    );

    const companyCount = (await client.query<{ n: string }>('select count(*) n from companies_master')).rows[0].n;
    record('companies_master seeded', Number(companyCount) > 0, `${companyCount} rows`);

    // ------------------------------------------------------------- fixtures
    // Created with no session context, which is the same path public signup
    // uses (users_insert_registration allows INSERT when no role is set).
    const ids: Record<string, string> = {};
    for (const [key, email] of Object.entries(emails)) {
      const role = key.startsWith('cand') ? 'candidate' : key;
      const res = await client.query<{ id: string }>(
        `insert into users (role, email, password_hash, phone)
         values ($1, $2, 'x-not-a-real-hash', '+910000000000') returning id`,
        [role, email],
      );
      ids[key] = res.rows[0].id;
    }
    await client.query(
      `insert into candidate_profiles (user_id, category, status)
       values ($1, 'fresher', 'approved'), ($2, 'fresher', 'draft')`,
      [ids.candA, ids.candB],
    );
    await client.query(`insert into company_profiles (user_id, company_name) values ($1, 'Verify Test Co')`, [
      ids.company,
    ]);

    // ------------------------------------------------- candidate isolation
    section('RLS — candidate isolation');

    const candA = { id: ids.candA, role: 'candidate' };
    const candB = { id: ids.candB, role: 'candidate' };

    record(
      'candidate CAN read their own users row',
      (await countAs(client, candA, 'select 1 from users where id = $1', [ids.candA])) === 1,
    );
    record(
      "candidate CANNOT read another candidate's users row",
      (await countAs(client, candA, 'select 1 from users where id = $1', [ids.candB])) === 0,
    );
    record(
      'candidate CAN read their own candidate_profiles row',
      (await countAs(client, candB, 'select 1 from candidate_profiles where user_id = $1', [ids.candB])) === 1,
    );
    record(
      "candidate CANNOT read another candidate's candidate_profiles row",
      (await countAs(client, candB, 'select 1 from candidate_profiles where user_id = $1', [ids.candA])) === 0,
    );
    record(
      'candidate CANNOT read admin_audit_logs at all',
      (await countAs(client, candA, 'select 1 from admin_audit_logs')) === 0,
    );

    // --------------------------------------------------- company visibility
    section('RLS — company visibility (contact info)');

    const company = { id: ids.company, role: 'company' };

    // candA is 'approved', candB is 'draft'.
    const approvedVisible = await countAs(
      client,
      company,
      'select 1 from candidate_profiles where user_id = $1',
      [ids.candA],
    );
    const draftVisible = await countAs(client, company, 'select 1 from candidate_profiles where user_id = $1', [
      ids.candB,
    ]);
    record('company CAN see an approved candidate profile', approvedVisible === 1);
    record('company CANNOT see a non-approved (draft) candidate profile', draftVisible === 0);

    // The contact fields live on `users` (email, phone) — and no policy grants
    // a company session any read of another user's row, so contact info is
    // unreachable regardless of profile status. This is the checklist's
    // "cannot see phone/email without a valid unlock" property: with no unlock
    // concept existing yet (Phase 3), the correct Phase 1 state is that a
    // company can never reach it.
    const contactApproved = await countAs(client, company, 'select 1 from users where id = $1', [ids.candA]);
    const contactDraft = await countAs(client, company, 'select 1 from users where id = $1', [ids.candB]);
    record(
      "company CANNOT read an approved candidate's users row (phone/email)",
      contactApproved === 0,
      'contact fields (email, phone) live on users; no company policy grants access',
    );
    record("company CANNOT read a draft candidate's users row (phone/email)", contactDraft === 0);

    const anyUser = await countAs(client, company, 'select 1 from users where id <> $1', [ids.company]);
    record('company CANNOT enumerate any other users row', anyUser === 0, `${anyUser} rows visible`);

    // ------------------------------------------------------ verifier scope
    section('RLS — verifier scope');

    const verifier = { id: ids.verifier, role: 'verifier' };
    record(
      'verifier CAN read candidate profiles awaiting review',
      (await countAs(client, verifier, 'select 1 from candidate_profiles where user_id = $1', [ids.candB])) === 1,
    );
    record(
      'verifier CANNOT read admin_audit_logs',
      (await countAs(client, verifier, 'select 1 from admin_audit_logs')) === 0,
    );
    record(
      "verifier CANNOT read candidates' users rows (contact info)",
      (await countAs(client, verifier, 'select 1 from users where id = $1', [ids.candA])) === 0,
    );

    // --------------------------------------------------------- admin access
    section('RLS — admin access');

    const admin = { id: ids.admin, role: 'admin' };
    record(
      'admin CAN read any users row',
      (await countAs(client, admin, 'select 1 from users where id = $1', [ids.candA])) === 1,
    );
    record(
      'admin CAN read any candidate profile',
      (await countAs(client, admin, 'select 1 from candidate_profiles where user_id = $1', [ids.candB])) === 1,
    );

    // ---------------------------------------------------- anonymous access
    section('RLS — anonymous (no session)');

    record(
      'master data readable without a session (public dropdowns)',
      (await countAs(client, null, 'select 1 from roles_master limit 1')) === 1,
    );
  } finally {
    // Cleanup — runs with no session context. RLS has no DELETE policy for the
    // null context, so this uses a superuser-style bypass via the table owner:
    // temporarily lifting FORCE would be invasive, so instead delete inside an
    // admin session, which does have a FOR ALL policy.
    await client.query('BEGIN');
    try {
      await client.query(`SET LOCAL app.current_user_role = 'admin'`);
      await client.query(`SET LOCAL app.current_user_id = '00000000-0000-0000-0000-000000000000'`);
      await client.query(`delete from users where email like 'verify.%@example.test'`);
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      console.error('\n  warning: test fixture cleanup failed:', err instanceof Error ? err.message : err);
      console.error("  remove manually with: delete from users where email like 'verify.%@example.test';");
    }
    await client.end();
  }

  const failed = checks.filter((c) => !c.ok);
  console.log(
    `\n[1m${checks.length - failed.length}/${checks.length} checks passed[0m` +
      (failed.length ? ` — [31m${failed.length} failed[0m` : ''),
  );
  if (failed.length) {
    console.log('\nFailed checks:');
    for (const f of failed) console.log(`  - ${f.name}`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('\nverification harness error:', err instanceof Error ? err.message : err);
  process.exit(2);
});
