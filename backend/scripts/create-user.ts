/**
 * Provisioning CLI for privileged accounts.
 *
 * The public /api/auth/signup endpoint deliberately only accepts the two
 * self-service roles (candidate, company) — letting anyone POST role:"admin"
 * would be a straightforward privilege-escalation hole. But the Phase 1
 * deliverables checklist still requires working accounts for all four roles,
 * so verifier/admin accounts need *some* supported creation path. This is it:
 * an operator-run command against the database, never reachable over HTTP.
 *
 * Usage:
 *   npm run create-user -- --email ops@example.com --password 'sTr0ngPass!' --role admin
 *   npm run create-user -- --email qa@example.com  --password 'sTr0ngPass!' --role verifier
 *
 * candidate/company are accepted too (handy for seeding test data), in which
 * case the matching profile row is created as well, mirroring signup().
 *
 * Verifier and admin accounts are NOT given a TOTP secret here — that is
 * enrolled on first login through the normal /onboarding/2fa flow, which is
 * what the "2FA enforced" checklist item is actually testing.
 */
import 'dotenv/config';
import { sequelize, User, CandidateProfile, CompanyProfile } from '../src/models';
import { hashPassword } from '../src/utils/password';
import { runInRequestContext } from '../src/utils/withRequestContext';

type Role = 'candidate' | 'company' | 'verifier' | 'admin';
const ROLES: readonly Role[] = ['candidate', 'company', 'verifier', 'admin'];

function parseArgs(argv: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith('--')) continue;
    const eq = arg.indexOf('=');
    if (eq !== -1) {
      out[arg.slice(2, eq)] = arg.slice(eq + 1);
    } else {
      out[arg.slice(2)] = argv[i + 1] ?? '';
      i++;
    }
  }
  return out;
}

function fail(message: string): never {
  console.error(`\n  error: ${message}\n`);
  console.error('  usage: npm run create-user -- --email <email> --password <password> --role <role>');
  console.error(`  roles: ${ROLES.join(' | ')}\n`);
  process.exit(1);
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const email = (args.email ?? '').trim().toLowerCase();
  const password = args.password ?? '';
  const role = (args.role ?? '').trim() as Role;

  if (!email || !email.includes('@')) fail('--email must be a valid email address');
  if (password.length < 8) fail('--password must be at least 8 characters');
  if (!ROLES.includes(role)) fail(`--role must be one of: ${ROLES.join(', ')}`);

  await sequelize.authenticate();

  const existing = await runInRequestContext(null, (t) =>
    User.findOne({ where: { email }, transaction: t }),
  );
  if (existing) fail(`an account already exists for ${email} (role: ${existing.role})`);

  const passwordHash = await hashPassword(password);

  const user = await runInRequestContext(null, async (t) => {
    const created = await User.create({ email, passwordHash, role }, { transaction: t });

    // verifier/admin have no profile table of their own; the two self-service
    // roles get the same profile row signup() would have created for them.
    if (role === 'candidate') {
      await CandidateProfile.create({ userId: created.id, status: 'draft' }, { transaction: t });
    } else if (role === 'company') {
      await CompanyProfile.create({ userId: created.id, companyName: email }, { transaction: t });
    }

    return created;
  });

  console.log(`\n  created ${role} account`);
  console.log(`    id:    ${user.id}`);
  console.log(`    email: ${user.email}`);

  if (role === 'verifier' || role === 'admin') {
    console.log('\n  This account requires 2FA. On first login the app will redirect to');
    console.log('  /onboarding/2fa to enrol a TOTP secret — scan the QR code with Google');
    console.log('  Authenticator (or any TOTP app), then enter the 6-digit code.\n');
  } else {
    console.log('');
  }

  await sequelize.close();
}

main().catch(async (err) => {
  console.error('\n  failed to create user:', err instanceof Error ? err.message : err, '\n');
  await sequelize.close().catch(() => undefined);
  process.exit(1);
});
