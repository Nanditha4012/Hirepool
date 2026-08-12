/**
 * Human-readable names for the two sides of a conversation.
 *
 * Both message inboxes were showing raw account data at people: a candidate's
 * inbox listed "hr@acme-corp.com" as the sender, because signup seeds
 * company_profiles.company_name with the account email
 * (authController.createProfileForRole) and a company that has not finished
 * its setup form still carries that placeholder. The company's own inbox was
 * worse — a candidate with no full_name on file appeared as "Unknown
 * candidate", and the composer asked the user to type a candidate UUID.
 *
 * Neither an email address nor a UUID is a name. These helpers guarantee that
 * whatever the database happens to hold, the UI has something to print that a
 * person can read and act on.
 */

/** Providers where the domain names a mail host, not the account's employer. */
const FREE_EMAIL_DOMAINS = new Set([
  'gmail.com',
  'googlemail.com',
  'yahoo.com',
  'yahoo.co.in',
  'hotmail.com',
  'outlook.com',
  'live.com',
  'icloud.com',
  'proton.me',
  'protonmail.com',
  'rediffmail.com',
]);

/** "acme-corp" / "acme_corp" / "acme.corp" -> "Acme Corp" */
function titleCase(slug: string): string {
  return slug
    .split(/[\s._-]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/**
 * What to call a company in someone else's UI.
 *
 * Prefers the name the company actually entered. Falls back to its email
 * domain when the stored name is still the signup placeholder — for a company
 * account that domain is almost always the company (`careers@zoho.com` ->
 * "Zoho"), which is a far better guess than showing the address itself. On a
 * free provider the domain says nothing, so the local part is used instead.
 */
export function companyDisplayName(
  companyName: string | null | undefined,
  email: string | null | undefined,
): string {
  const name = companyName?.trim() ?? '';

  // A real, filled-in name. The '@' test is the same one the frontend's
  // isProfileFilledIn() uses to decide whether setup is done.
  if (name && !name.includes('@')) return name;

  const source = (name.includes('@') ? name : email) ?? '';
  const [localPart, domain] = source.split('@');
  if (!localPart) return 'Unnamed company';

  if (domain && !FREE_EMAIL_DOMAINS.has(domain.toLowerCase())) {
    // Drop the TLD and any country suffix: "acme-corp.co.in" -> "acme-corp".
    const base = domain.toLowerCase().split('.')[0];
    if (base) return titleCase(base);
  }

  return titleCase(localPart);
}

/**
 * What to call a candidate in a company's UI.
 *
 * Never returns an id. A candidate reaches a company's inbox only through an
 * unlock or a message, both of which require an approved profile — and
 * submitting a profile requires a full name — so the fallback is a safety net
 * for legacy rows rather than the common path.
 */
export function candidateDisplayName(
  fullName: string | null | undefined,
  email: string | null | undefined,
): string {
  const name = fullName?.trim();
  if (name) return name;

  const localPart = email?.split('@')[0];
  if (localPart) return titleCase(localPart);

  return 'Candidate';
}
