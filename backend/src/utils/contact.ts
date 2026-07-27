/**
 * Shared "blurred until unlock" contact-derivation helper, used by
 * companyController.searchCandidates, unlockController.unlockCandidate, and
 * unlockController.listMyUnlocked so the wa.me link format stays identical
 * everywhere a candidate's phone is surfaced to a company.
 */
export function buildWhatsappLink(phone: string | null | undefined): string | null {
  if (!phone) return null;
  return `https://wa.me/${phone.replace(/\D/g, '')}`;
}
