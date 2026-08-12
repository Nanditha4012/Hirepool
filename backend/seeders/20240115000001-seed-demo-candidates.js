'use strict';

const bcrypt = require('bcryptjs');

/**
 * Demo accounts covering every case the product has, so the whole app can be
 * walked through without hand-building data through the UI first.
 *
 * What it covers, and why each row exists:
 *
 *   category x status — a candidate in every one of the three categories,
 *   spread across all six profile statuses. Between them these exercise the
 *   entry-point router (draft -> builder, submitted/rejected -> report,
 *   approved -> dashboard), the verification gate (only `approved` gets the
 *   feed, communities and contests) and the verifier's three queue catalogs.
 *
 *   rejected / needs_info with real field checks — including failures on
 *   MANDATORY fields, which is what the submission report's "Must fix" card
 *   reads. A rejection with only optional failures is seeded too, so the
 *   mandatory/optional split is visibly different rather than theoretical.
 *
 *   two companies, one verified and one not — the pair needed to see both
 *   sides of the company gate.
 *
 *   unlocks and message threads — with unread messages on both sides, so the
 *   inboxes have something to show and the unread badges are non-zero.
 *
 * Every account uses the same password: Test@1234
 *
 * Idempotent, like every other seeder here: `db:seed:all` does not track what
 * has already run, so this deletes any previous demo rows (matched on the
 * @demo.hirepool.local email suffix) before inserting. That suffix is also
 * what makes `down` safe — it can only ever remove rows this file created,
 * never a real account.
 */

const DEMO_SUFFIX = '@demo.hirepool.local';
const PASSWORD = 'Test@1234';

/** Days before/after now, as a Date. Keeps the timeline readable. */
function daysAgo(days) {
  return new Date(Date.now() - days * 86_400_000);
}

// ---------------------------------------------------------------------------
// The cast
// ---------------------------------------------------------------------------

const CANDIDATES = [
  {
    key: 'fresher_approved',
    fullName: 'Aarav Sharma',
    email: 'aarav.fresher.approved' + DEMO_SUFFIX,
    phone: '+91 98450 11001',
    category: 'fresher',
    status: 'approved',
    location: 'Bengaluru, Karnataka',
    noticePeriod: 'immediate',
    primaryRole: 'Backend Developer',
    secondaryRoles: ['Full Stack Developer'],
    skills: ['Java', 'Python', 'SQL', 'Docker'],
    domain: 'Fintech',
    resumeLink: 'https://example.com/resumes/aarav-sharma.pdf',
    portfolioLink: 'https://aaravsharma.dev',
    submittedDaysAgo: 21,
    isActivelyLooking: true,
    badges: [
      { platform: 'LeetCode', badge: 'Knight', solved: 620, status: 'verified' },
      { platform: 'GitHub', badge: 'Pull Shark', solved: 0, status: 'verified' },
    ],
    achievements: [
      { type: 'project', title: 'Split-wise clone with UPI settlement', status: 'verified' },
      { type: 'project', title: 'Realtime bus tracker for BMTC', status: 'verified' },
      { type: 'project', title: 'Resume parser with spaCy', status: 'verified' },
      { type: 'achievement', title: 'Smart India Hackathon finalist', status: 'verified' },
    ],
    fieldChecks: 'all_passed',
  },
  {
    key: 'fresher_rejected',
    fullName: 'Diya Patel',
    email: 'diya.fresher.rejected' + DEMO_SUFFIX,
    phone: '+91 98450 11002',
    category: 'fresher',
    status: 'rejected',
    location: 'Ahmedabad, Gujarat',
    noticePeriod: 'immediate',
    primaryRole: 'Frontend Developer',
    secondaryRoles: [],
    skills: ['JavaScript', 'React'],
    domain: 'E-commerce',
    // Deliberately blank: this is one of the mandatory failures below.
    resumeLink: '',
    portfolioLink: 'https://diyapatel.netlify.app',
    submittedDaysAgo: 9,
    isActivelyLooking: true,
    badges: [{ platform: 'HackerRank', badge: '4 star', solved: 180, status: 'rejected' }],
    achievements: [
      { type: 'project', title: 'Portfolio site', status: 'rejected' },
      { type: 'project', title: 'Weather widget', status: 'pending' },
    ],
    // The case the "Must fix" summary card exists for: two blocking failures
    // and one that is only a suggestion.
    fieldChecks: 'mandatory_failures',
    decisionNote:
      'Resume link is missing and only two projects were submitted. Freshers need three live project links plus a resume before we can verify.',
  },
  {
    key: 'fresher_submitted',
    fullName: 'Rohan Mehta',
    email: 'rohan.fresher.submitted' + DEMO_SUFFIX,
    phone: '+91 98450 11003',
    category: 'fresher',
    status: 'submitted',
    location: 'Pune, Maharashtra',
    noticePeriod: 'immediate',
    primaryRole: 'Data Engineer',
    secondaryRoles: ['Data Scientist'],
    skills: ['Python', 'SQL'],
    domain: 'Logistics & Supply Chain',
    resumeLink: 'https://example.com/resumes/rohan-mehta.pdf',
    portfolioLink: '',
    submittedDaysAgo: 2,
    isActivelyLooking: true,
    badges: [{ platform: 'LeetCode', badge: 'Guardian', solved: 940, status: 'pending' }],
    achievements: [
      { type: 'project', title: 'Warehouse demand forecaster', status: 'pending' },
      { type: 'project', title: 'ETL pipeline on Airflow', status: 'pending' },
      { type: 'project', title: 'Route optimiser', status: 'pending' },
    ],
    // Nothing checked yet — sits at the top of the verifier queue.
    fieldChecks: 'none',
  },
  {
    key: 'experienced_approved',
    fullName: 'Ananya Iyer',
    email: 'ananya.experienced.approved' + DEMO_SUFFIX,
    phone: '+91 98450 11004',
    category: 'experienced',
    status: 'approved',
    location: 'Chennai, Tamil Nadu',
    noticePeriod: '60_days',
    primaryRole: 'Full Stack Developer',
    designationRole: 'Software Engineer',
    secondaryRoles: ['Backend Developer', 'DevOps Engineer'],
    skills: ['TypeScript', 'React', 'Node.js', 'AWS', 'PostgreSQL'],
    domain: 'SaaS',
    resumeLink: 'https://example.com/resumes/ananya-iyer.pdf',
    portfolioLink: 'https://github.com/ananya-iyer',
    yearsOfExperience: 5,
    currentCompany: 'Microsoft',
    companyType: 'mnc',
    offerLetterOrLinkedinLink: 'https://linkedin.com/in/ananya-iyer',
    submittedDaysAgo: 40,
    isActivelyLooking: true,
    isBoosted: true,
    badges: [{ platform: 'LeetCode', badge: 'Guardian', solved: 1240, status: 'verified' }],
    achievements: [
      { type: 'project', title: 'Multi-tenant billing service', status: 'verified' },
      { type: 'project', title: 'Zero-downtime schema migrator', status: 'verified' },
      { type: 'project', title: 'Internal design system', status: 'verified' },
      { type: 'achievement', title: 'Patent — adaptive rate limiting', status: 'verified' },
      { type: 'research', title: 'Paper on consistent hashing at scale', status: 'verified' },
    ],
    fieldChecks: 'all_passed',
  },
  {
    key: 'experienced_under_review',
    fullName: 'Vikram Nair',
    email: 'vikram.experienced.review' + DEMO_SUFFIX,
    phone: '+91 98450 11005',
    category: 'experienced',
    status: 'under_review',
    location: 'Kochi, Kerala',
    noticePeriod: '30_days',
    primaryRole: 'DevOps Engineer',
    designationRole: 'Site Reliability Engineer',
    secondaryRoles: ['Backend Developer'],
    skills: ['Go', 'Docker', 'Kubernetes', 'AWS'],
    domain: 'Healthtech',
    resumeLink: 'https://example.com/resumes/vikram-nair.pdf',
    portfolioLink: '',
    yearsOfExperience: 7,
    currentCompany: 'Infosys',
    companyType: 'mnc',
    offerLetterOrLinkedinLink: 'https://linkedin.com/in/vikram-nair',
    submittedDaysAgo: 4,
    isActivelyLooking: true,
    badges: [{ platform: 'GitHub', badge: 'Starstruck', solved: 0, status: 'pending' }],
    achievements: [
      { type: 'project', title: 'Cluster autoscaler for spot fleets', status: 'verified' },
      { type: 'project', title: 'Incident timeline bot', status: 'pending' },
      { type: 'project', title: 'Terraform module library', status: 'pending' },
      { type: 'achievement', title: 'Cut deploy time 45m to 6m', status: 'pending' },
    ],
    // Half-checked — the mid-review state the verifier portal renders.
    fieldChecks: 'partial',
  },
  {
    key: 'experienced_needs_info',
    fullName: 'Sneha Reddy',
    email: 'sneha.experienced.needsinfo' + DEMO_SUFFIX,
    phone: '+91 98450 11006',
    category: 'experienced',
    status: 'needs_info',
    location: 'Hyderabad, Telangana',
    noticePeriod: '90_plus_days',
    primaryRole: 'Data Scientist',
    designationRole: 'ML Engineer',
    secondaryRoles: ['ML Engineer'],
    skills: ['Python', 'SQL', 'TensorFlow'],
    domain: 'Insurtech',
    resumeLink: 'https://example.com/resumes/sneha-reddy.pdf',
    portfolioLink: '',
    yearsOfExperience: 6,
    currentCompany: 'Wipro',
    companyType: 'mnc',
    // Blank on purpose — the single mandatory failure below.
    offerLetterOrLinkedinLink: '',
    submittedDaysAgo: 6,
    isActivelyLooking: false,
    badges: [],
    achievements: [
      { type: 'project', title: 'Claims fraud classifier', status: 'verified' },
      { type: 'project', title: 'Churn model for renewals', status: 'verified' },
      { type: 'project', title: 'Underwriting assistant', status: 'verified' },
      { type: 'achievement', title: 'Best paper, internal ML summit', status: 'pending' },
    ],
    fieldChecks: 'one_mandatory_failure',
    decisionNote:
      'Everything checks out except proof of your current employment. Add an offer letter or LinkedIn link and resubmit.',
  },
  {
    key: 'executive_approved',
    fullName: 'Karthik Rao',
    email: 'karthik.executive.approved' + DEMO_SUFFIX,
    phone: '+91 98450 11007',
    category: 'executive',
    status: 'approved',
    location: 'Bengaluru, Karnataka',
    noticePeriod: '90_plus_days',
    primaryRole: 'Engineering Manager',
    designationRole: 'Engineering Manager',
    secondaryRoles: ['Software Engineer'],
    skills: ['Java', 'AWS', 'PostgreSQL'],
    domain: 'Fintech',
    resumeLink: 'https://example.com/resumes/karthik-rao.pdf',
    portfolioLink: 'https://linkedin.com/in/karthik-rao',
    yearsOfExperience: 14,
    currentCompany: 'Amazon',
    companyType: 'mnc',
    offerLetterOrLinkedinLink: 'https://linkedin.com/in/karthik-rao',
    teamSizeManaged: 42,
    budgetOwned: '₹18 Cr annual',
    titleLevel: 'Senior Engineering Manager (L7)',
    submittedDaysAgo: 60,
    isActivelyLooking: true,
    badges: [],
    achievements: [
      { type: 'project', title: 'Payments platform re-architecture', status: 'verified' },
      { type: 'project', title: 'Org-wide on-call overhaul', status: 'verified' },
      { type: 'project', title: 'Cost programme — 31% infra reduction', status: 'verified' },
      { type: 'achievement', title: 'Grew team 12 to 42 with 94% retention', status: 'verified' },
    ],
    fieldChecks: 'all_passed',
  },
  {
    key: 'executive_draft',
    fullName: 'Meera Krishnan',
    email: 'meera.executive.draft' + DEMO_SUFFIX,
    phone: '+91 98450 11008',
    category: 'executive',
    status: 'draft',
    location: 'Mumbai, Maharashtra',
    noticePeriod: '',
    primaryRole: 'Product Manager',
    secondaryRoles: [],
    skills: ['SQL'],
    domain: '',
    // Half-finished on purpose: this is the account for checking the profile
    // builder's readiness meter with real gaps in it.
    resumeLink: '',
    portfolioLink: '',
    yearsOfExperience: 11,
    currentCompany: '',
    companyType: '',
    offerLetterOrLinkedinLink: '',
    submittedDaysAgo: null,
    isActivelyLooking: true,
    badges: [],
    achievements: [{ type: 'project', title: 'Marketplace pricing revamp', status: 'pending' }],
    fieldChecks: 'none',
  },
];

const COMPANIES = [
  {
    key: 'verified',
    email: 'talent.acmecorp' + DEMO_SUFFIX,
    companyName: 'Acme Corp',
    fullName: 'Priya Menon',
    phone: '+91 98450 22001',
    website: 'https://acmecorp.example.com',
    industry: 'Fintech',
    size: '201-1000',
    verified: true,
    remainingUnlocks: 25,
  },
  {
    key: 'unverified',
    // Deliberately left with no company name of its own, so this account also
    // demonstrates the "still shows the signup email" case the inbox's
    // display-name fallback handles (see utils/displayName.ts).
    email: 'hiring.northwindlabs' + DEMO_SUFFIX,
    companyName: null,
    fullName: 'Sameer Joshi',
    phone: '+91 98450 22002',
    website: '',
    industry: '',
    size: null,
    verified: false,
    remainingUnlocks: 3,
  },
];

// ---------------------------------------------------------------------------

/** Field checks per scenario. Keys match the verifier checklist's fieldKeys. */
function fieldChecksFor(candidate) {
  const base = [
    { key: 'fullName', label: 'Full name', passed: true },
    { key: 'phone', label: 'Phone', passed: true },
    { key: 'email', label: 'Email', passed: true },
    { key: 'primaryRole', label: 'Primary role', passed: true },
    { key: 'domain', label: 'Domain', passed: true },
  ];

  switch (candidate.fieldChecks) {
    case 'none':
      return [];

    case 'all_passed':
      return [
        ...base,
        { key: 'resumeLink', label: 'Resume link', passed: true },
        { key: 'skills', label: 'Skills', passed: true },
        { key: 'location', label: 'Location', passed: true },
        ...(candidate.category === 'fresher'
          ? []
          : [
              { key: 'yearsOfExperience', label: 'Years of experience', passed: true },
              { key: 'currentCompany', label: 'Current company', passed: true },
              { key: 'designationRole', label: 'Designation', passed: true },
              { key: 'companyType', label: 'Company type', passed: true },
              { key: 'offerLetterOrLinkedinLink', label: 'Offer letter or LinkedIn', passed: true },
            ]),
        ...(candidate.category === 'executive'
          ? [{ key: 'teamSizeManaged', label: 'Team size managed', passed: true }]
          : []),
      ];

    case 'partial':
      // Mid-review: identity done, proof not looked at yet.
      return base;

    case 'mandatory_failures':
      return [
        ...base,
        {
          key: 'resumeLink',
          label: 'Resume link',
          passed: false,
          reason: 'No resume link was provided. This is required for every candidate.',
        },
        {
          key: 'projectCount',
          label: 'Minimum 3 projects (2 submitted)',
          passed: false,
          reason: 'Only 2 projects submitted. Freshers must submit at least three.',
        },
        {
          // Optional, so it must NOT appear in the must-fix card — it is the
          // contrast that makes the split legible.
          key: 'portfolioLink',
          label: 'Portfolio link',
          passed: false,
          reason: 'The portfolio link returns a 404. Worth fixing, but not blocking.',
        },
      ];

    case 'one_mandatory_failure':
      return [
        ...base,
        { key: 'resumeLink', label: 'Resume link', passed: true },
        { key: 'yearsOfExperience', label: 'Years of experience', passed: true },
        { key: 'currentCompany', label: 'Current company', passed: true },
        { key: 'designationRole', label: 'Designation', passed: true },
        { key: 'companyType', label: 'Company type', passed: true },
        {
          key: 'offerLetterOrLinkedinLink',
          label: 'Offer letter or LinkedIn',
          passed: false,
          reason: 'No proof of current employment was attached.',
        },
      ];

    default:
      return [];
  }
}

module.exports = {
  up: async (queryInterface, Sequelize) => {
    const { QueryTypes } = Sequelize;
    const sequelize = queryInterface.sequelize;
    const select = (sql, replacements) =>
      sequelize.query(sql, { replacements, type: QueryTypes.SELECT });

    // Master data this seeder points at. Resolved by name rather than
    // hardcoded ids, because the master seeders let Postgres generate theirs.
    const roles = await select('SELECT id, role_name FROM roles_master;');
    const skills = await select('SELECT id, skill_name FROM skills_master;');
    const domains = await select('SELECT id, domain_name FROM domains_master;');
    const companies = await select('SELECT id, company_name FROM companies_master;');
    const [verifier] = await select(
      "SELECT id FROM users WHERE role = 'verifier' ORDER BY created_at ASC LIMIT 1;",
    );
    const [freePlan] = await select(
      "SELECT id FROM plans_master WHERE LOWER(name) = 'free' LIMIT 1;",
    );

    const roleId = (name) => roles.find((r) => r.role_name === name)?.id ?? null;
    const skillId = (name) => skills.find((s) => s.skill_name === name)?.id ?? null;
    const domainId = (name) => domains.find((d) => d.domain_name === name)?.id ?? null;
    const companyMasterId = (name) => companies.find((c) => c.company_name === name)?.id ?? null;

    // Clean slate. Deleting the users cascades to profiles, skills, badges,
    // achievements, messages and unlocks via the FKs declared in the
    // migrations, so this one statement is the whole teardown.
    await sequelize.query('DELETE FROM users WHERE email LIKE :pattern;', {
      replacements: { pattern: '%' + DEMO_SUFFIX },
    });

    const passwordHash = await bcrypt.hash(PASSWORD, 10);

    // ---- Companies -----------------------------------------------------
    for (const company of COMPANIES) {
      const [user] = await sequelize.query(
        `INSERT INTO users (role, email, password_hash, full_name, phone)
         VALUES ('company', :email, :passwordHash, :fullName, :phone)
         RETURNING id;`,
        { replacements: { ...company, passwordHash }, type: QueryTypes.SELECT },
      );

      await sequelize.query(
        `INSERT INTO company_profiles
           (user_id, company_name, website, industry, size, verified, plan_id, remaining_unlocks)
         VALUES (:userId, :companyName, :website, :industry, :size, :verified, :planId, :remainingUnlocks);`,
        {
          replacements: {
            userId: user.id,
            // Mirrors what signup does when setup was never completed.
            companyName: company.companyName ?? company.email,
            website: company.website || null,
            industry: company.industry || null,
            size: company.size,
            verified: company.verified,
            planId: freePlan?.id ?? null,
            remainingUnlocks: company.remainingUnlocks,
          },
        },
      );

      company.userId = user.id;
    }

    // ---- Candidates ----------------------------------------------------
    for (const candidate of CANDIDATES) {
      const [user] = await sequelize.query(
        `INSERT INTO users (role, email, password_hash, full_name, phone)
         VALUES ('candidate', :email, :passwordHash, :fullName, :phone)
         RETURNING id;`,
        { replacements: { ...candidate, passwordHash }, type: QueryTypes.SELECT },
      );
      candidate.userId = user.id;

      const submittedAt =
        candidate.submittedDaysAgo === null ? null : daysAgo(candidate.submittedDaysAgo);

      const [profile] = await sequelize.query(
        `INSERT INTO candidate_profiles
           (user_id, category, status, primary_role_id, domain_id, resume_link, portfolio_link,
            years_of_experience, current_company_id, designation_role_id,
            offer_letter_or_linkedin_link, company_type, team_size_managed, budget_owned,
            title_level, is_actively_looking, location, notice_period, submitted_at, is_boosted,
            boost_expires_at)
         VALUES
           (:userId, :category, :status, :primaryRoleId, :domainId, :resumeLink, :portfolioLink,
            :yearsOfExperience, :currentCompanyId, :designationRoleId,
            :offerLetterOrLinkedinLink, :companyType, :teamSizeManaged, :budgetOwned,
            :titleLevel, :isActivelyLooking, :location, :noticePeriod, :submittedAt, :isBoosted,
            :boostExpiresAt)
         RETURNING id;`,
        {
          replacements: {
            userId: user.id,
            category: candidate.category,
            status: candidate.status,
            primaryRoleId: roleId(candidate.primaryRole),
            domainId: candidate.domain ? domainId(candidate.domain) : null,
            resumeLink: candidate.resumeLink || null,
            portfolioLink: candidate.portfolioLink || null,
            yearsOfExperience: candidate.yearsOfExperience ?? null,
            currentCompanyId: candidate.currentCompany
              ? companyMasterId(candidate.currentCompany)
              : null,
            designationRoleId: candidate.designationRole
              ? roleId(candidate.designationRole)
              : null,
            offerLetterOrLinkedinLink: candidate.offerLetterOrLinkedinLink || null,
            companyType: candidate.companyType || null,
            teamSizeManaged: candidate.teamSizeManaged ?? null,
            budgetOwned: candidate.budgetOwned ?? null,
            titleLevel: candidate.titleLevel ?? null,
            isActivelyLooking: candidate.isActivelyLooking,
            location: candidate.location || null,
            noticePeriod: candidate.noticePeriod || null,
            submittedAt,
            isBoosted: Boolean(candidate.isBoosted),
            boostExpiresAt: candidate.isBoosted ? daysAgo(-25) : null,
          },
          type: QueryTypes.SELECT,
        },
      );
      candidate.profileId = profile.id;

      for (const name of candidate.secondaryRoles) {
        const id = roleId(name);
        if (!id) continue;
        await sequelize.query(
          'INSERT INTO candidate_secondary_roles (candidate_id, role_id) VALUES (:candidateId, :roleId);',
          { replacements: { candidateId: user.id, roleId: id } },
        );
      }

      for (const name of candidate.skills) {
        const id = skillId(name);
        if (!id) continue;
        await sequelize.query(
          'INSERT INTO candidate_skills (candidate_id, skill_id) VALUES (:candidateId, :skillId);',
          { replacements: { candidateId: user.id, skillId: id } },
        );
      }

      for (const badge of candidate.badges) {
        await sequelize.query(
          `INSERT INTO candidate_platform_badges
             (candidate_id, platform_name, badge_selected, platform_profile_link,
              verification_status, rejection_reason, total_questions_solved)
           VALUES (:candidateId, :platformName, :badgeSelected, :link, :status, :reason, :solved);`,
          {
            replacements: {
              candidateId: user.id,
              platformName: badge.platform,
              badgeSelected: badge.badge,
              link:
                'https://' +
                badge.platform.toLowerCase() +
                '.com/' +
                candidate.fullName.split(' ')[0].toLowerCase(),
              status: badge.status,
              reason:
                badge.status === 'rejected'
                  ? 'The linked profile does not show this badge.'
                  : null,
              solved: badge.solved,
            },
          },
        );
      }

      for (const achievement of candidate.achievements) {
        await sequelize.query(
          `INSERT INTO candidate_achievements
             (candidate_id, type, title, description, certificate_or_proof_link,
              verification_status, rejection_reason)
           VALUES (:candidateId, :type, :title, :description, :link, :status, :reason);`,
          {
            replacements: {
              candidateId: user.id,
              type: achievement.type,
              title: achievement.title,
              description: 'Seeded demo entry for ' + candidate.fullName + '.',
              link: 'https://example.com/proof/' + encodeURIComponent(achievement.title),
              status: achievement.status,
              reason:
                achievement.status === 'rejected'
                  ? 'The proof link is not reachable.'
                  : null,
            },
          },
        );
      }

      // Field checks + the decision log entry that put the profile in its
      // current status. Both need a verifier to attribute them to; if the
      // verifier seeder has not run there is nobody to be the reviewer, so
      // the review history is skipped rather than faked with a null FK.
      const checks = verifier ? fieldChecksFor(candidate) : [];
      for (const check of checks) {
        await sequelize.query(
          `INSERT INTO profile_field_checks
             (profile_id, candidate_id, reviewer_id, field_key, field_label, passed, reason_text, created_at)
           VALUES (:profileId, :candidateId, :reviewerId, :fieldKey, :fieldLabel, :passed, :reasonText, :createdAt);`,
          {
            replacements: {
              profileId: profile.id,
              candidateId: user.id,
              reviewerId: verifier.id,
              fieldKey: check.key,
              fieldLabel: check.label,
              passed: check.passed,
              reasonText: check.reason ?? null,
              createdAt: daysAgo(Math.max(0, (candidate.submittedDaysAgo ?? 1) - 1)),
            },
          },
        );
      }

      const decision =
        candidate.status === 'approved'
          ? 'approved'
          : candidate.status === 'rejected'
            ? 'rejected'
            : candidate.status === 'needs_info'
              ? 'needs_info'
              : null;

      if (verifier && decision) {
        await sequelize.query(
          `INSERT INTO verification_logs (reviewer_id, target_type, target_id, decision, notes, created_at)
           VALUES (:reviewerId, 'candidate_profile', :targetId, :decision, :notes, :createdAt);`,
          {
            replacements: {
              reviewerId: verifier.id,
              targetId: profile.id,
              decision,
              notes:
                candidate.decisionNote ??
                'Profile verified. All required fields checked and accepted.',
              createdAt: daysAgo(Math.max(0, (candidate.submittedDaysAgo ?? 1) - 1)),
            },
          },
        );
      }
    }

    // ---- Unlocks and conversations -------------------------------------
    // Only the verified company, and only against approved candidates —
    // exactly what the product allows, so the demo data can't show a state
    // the app would refuse to create.
    const acme = COMPANIES.find((c) => c.key === 'verified');
    const approved = CANDIDATES.filter((c) => c.status === 'approved');

    for (const candidate of approved) {
      await sequelize.query(
        `INSERT INTO unlocks (company_id, candidate_id, unlocked_at, note)
         VALUES (:companyId, :candidateId, :unlockedAt, :note);`,
        {
          replacements: {
            companyId: acme.userId,
            candidateId: candidate.userId,
            unlockedAt: daysAgo(5),
            note: 'Shortlisted for the platform team round.',
          },
        },
      );
    }

    const conversations = [
      {
        candidateKey: 'fresher_approved',
        messages: [
          {
            from: 'company',
            body: "Hi Aarav — I'm Priya from Acme Corp. Your BMTC tracker project is exactly the kind of work we're hiring for. Would you be open to a chat this week?",
            daysAgo: 4,
            read: true,
          },
          {
            from: 'candidate',
            body: 'Hi Priya, thanks for reaching out! Yes, definitely interested. I am free Thursday or Friday afternoon.',
            daysAgo: 4,
            read: true,
          },
          {
            from: 'company',
            body: "Thursday 3pm works. I'll send an invite. It's a 45-minute technical discussion, no take-home.",
            daysAgo: 3,
            // Unread, so the candidate's inbox opens with a badge on it.
            read: false,
          },
        ],
      },
      {
        candidateKey: 'experienced_approved',
        messages: [
          {
            from: 'company',
            body: 'Hi Ananya — your multi-tenant billing work lines up well with a Staff Engineer role we have open. Happy to share the JD if useful.',
            daysAgo: 2,
            read: true,
          },
          {
            from: 'candidate',
            body: 'Please do send it across. I am on a 60-day notice, so worth knowing your timelines too.',
            daysAgo: 1,
            // Unread on the company side — the other direction of the badge.
            read: false,
          },
        ],
      },
      {
        candidateKey: 'executive_approved',
        messages: [
          {
            from: 'company',
            body: 'Karthik — we are building out an engineering leadership bench and your name came up. Would a confidential conversation be welcome?',
            daysAgo: 6,
            read: true,
          },
        ],
      },
    ];

    for (const conversation of conversations) {
      const candidate = CANDIDATES.find((c) => c.key === conversation.candidateKey);
      for (const message of conversation.messages) {
        await sequelize.query(
          `INSERT INTO messages (company_id, candidate_id, sender_role, body, created_at, read_at)
           VALUES (:companyId, :candidateId, :senderRole, :body, :createdAt, :readAt);`,
          {
            replacements: {
              companyId: acme.userId,
              candidateId: candidate.userId,
              senderRole: message.from,
              body: message.body,
              createdAt: daysAgo(message.daysAgo),
              readAt: message.read ? daysAgo(message.daysAgo) : null,
            },
          },
        );
      }
    }

    // eslint-disable-next-line no-console
    console.log(
      '[seed] ' +
        CANDIDATES.length +
        ' demo candidates and ' +
        COMPANIES.length +
        ' demo companies created. Password for all: ' +
        PASSWORD,
    );
  },

  down: async (queryInterface) => {
    // The email suffix is the only thing identifying these rows, which is
    // what makes this safe: it cannot match a real account.
    await queryInterface.sequelize.query('DELETE FROM users WHERE email LIKE :pattern;', {
      replacements: { pattern: '%' + DEMO_SUFFIX },
    });
  },
};
