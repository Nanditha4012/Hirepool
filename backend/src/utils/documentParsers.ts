import type {
  DocumentFieldMatches,
  ExtractedDocumentFields,
} from '../models/CandidateVerificationDocument';

/**
 * Turns the text pulled out of a document into fields, and decides how well
 * those fields agree with what the candidate typed.
 *
 * Everything here is deliberately forgiving in one direction and strict in the
 * other. Forgiving, because the input is frequently a photo of a laminated
 * certificate read by OCR: "RAJESH KUMAR" comes back as "RAJESH KUMAF" often
 * enough that exact string equality would reject honest candidates all day.
 * Strict, because the output is allowed to bypass a human — so a weak match is
 * never upgraded to a pass, it is routed to a verifier instead.
 */

// ---------------------------------------------------------------------------
// Text normalisation
// ---------------------------------------------------------------------------

/** Collapses OCR noise so two spellings of the same name can be compared. */
function normalise(value: string): string {
  return value
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Levenshtein distance, iterative with a single row.
 *
 * Written out rather than pulled in as a dependency: it is fifteen lines, the
 * strings are names (tens of characters), and this is the only place in the
 * codebase that needs it.
 */
function editDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  let previous = Array.from({ length: b.length + 1 }, (_, i) => i);

  for (let i = 1; i <= a.length; i += 1) {
    const current = [i];
    for (let j = 1; j <= b.length; j += 1) {
      const substitution = previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1);
      const insertion = current[j - 1] + 1;
      const deletion = previous[j] + 1;
      current[j] = Math.min(substitution, insertion, deletion);
    }
    previous = current;
  }

  return previous[b.length];
}

/** 0–1 similarity, 1 being identical. */
export function similarity(a: string, b: string): number {
  const left = normalise(a);
  const right = normalise(b);
  if (!left || !right) return 0;
  const longest = Math.max(left.length, right.length);
  return 1 - editDistance(left, right) / longest;
}

/**
 * Name comparison, which is its own problem in India and not a string compare.
 *
 * The same person is "Varun T P" on a marks card, "Varun Gowda T P" on an
 * Aadhaar and "T P Varun" in a form, and initials expand or contract freely
 * between documents. So: compare the sets of word-parts rather than the whole
 * string, ignore ordering, treat a single letter as matching any word that
 * starts with it, and score by how much of the *shorter* name is accounted
 * for — a document carrying extra middle names should not penalise a
 * candidate who typed fewer.
 */
export function nameSimilarity(claimed: string, found: string): number {
  const claimedParts = normalise(claimed).split(' ').filter(Boolean);
  const foundParts = normalise(found).split(' ').filter(Boolean);
  if (claimedParts.length === 0 || foundParts.length === 0) return 0;

  const [shorter, longer] =
    claimedParts.length <= foundParts.length
      ? [claimedParts, foundParts]
      : [foundParts, claimedParts];

  const unmatched = [...longer];
  let matched = 0;

  for (const part of shorter) {
    const index = unmatched.findIndex((candidate) => {
      if (part.length === 1) return candidate.startsWith(part);
      if (candidate.length === 1) return part.startsWith(candidate);
      // 0.8 tolerates roughly one wrong character in five — the rate OCR
      // actually produces on a clean photo.
      return similarity(part, candidate) >= 0.8;
    });
    if (index !== -1) {
      matched += 1;
      unmatched.splice(index, 1);
    }
  }

  return matched / shorter.length;
}

// ---------------------------------------------------------------------------
// Aadhaar
// ---------------------------------------------------------------------------

/**
 * The Verhoeff checksum Aadhaar numbers carry.
 *
 * Worth doing because it is what separates "the OCR found twelve digits" from
 * "the OCR found an Aadhaar number". Enrolment ids, phone numbers with an STD
 * code and mis-read dates all produce twelve-digit runs; almost none of them
 * satisfy Verhoeff. Tables are from the standard.
 */
const VERHOEFF_D = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  [1, 2, 3, 4, 0, 6, 7, 8, 9, 5],
  [2, 3, 4, 0, 1, 7, 8, 9, 5, 6],
  [3, 4, 0, 1, 2, 8, 9, 5, 6, 7],
  [4, 0, 1, 2, 3, 9, 5, 6, 7, 8],
  [5, 9, 8, 7, 6, 0, 4, 3, 2, 1],
  [6, 5, 9, 8, 7, 1, 0, 4, 3, 2],
  [7, 6, 5, 9, 8, 2, 1, 0, 4, 3],
  [8, 7, 6, 5, 9, 3, 2, 1, 0, 4],
  [9, 8, 7, 6, 5, 4, 3, 2, 1, 0],
];

const VERHOEFF_P = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  [1, 5, 7, 6, 2, 8, 3, 0, 9, 4],
  [5, 8, 0, 3, 7, 9, 6, 1, 4, 2],
  [8, 9, 1, 6, 0, 4, 3, 5, 2, 7],
  [9, 4, 5, 3, 1, 2, 6, 8, 7, 0],
  [4, 2, 8, 6, 5, 7, 3, 9, 0, 1],
  [2, 7, 9, 3, 8, 0, 6, 4, 1, 5],
  [7, 0, 4, 6, 9, 1, 3, 2, 5, 8],
];

export function isValidAadhaarNumber(digits: string): boolean {
  if (!/^\d{12}$/.test(digits)) return false;
  // A leading 0 or 1 is never issued.
  if (digits[0] === '0' || digits[0] === '1') return false;

  let checksum = 0;
  const reversed = digits.split('').reverse();
  reversed.forEach((digit, index) => {
    checksum = VERHOEFF_D[checksum][VERHOEFF_P[index % 8][Number(digit)]];
  });
  return checksum === 0;
}

/** `12/07/2001`, `12-07-2001`, `2001-07-12` and the bare year Aadhaar sometimes carries. */
function parseDob(text: string): string | undefined {
  const dmy = text.match(/\b(\d{2})[/\-.](\d{2})[/\-.](\d{4})\b/);
  if (dmy) return `${dmy[3]}-${dmy[2]}-${dmy[1]}`;

  const ymd = text.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  if (ymd) return `${ymd[1]}-${ymd[2]}-${ymd[3]}`;

  const yearOnly = text.match(/(?:year\s+of\s+birth|yob)\s*[:\-]?\s*(\d{4})/i);
  if (yearOnly) return yearOnly[1];

  return undefined;
}

/**
 * Pulls the name off an Aadhaar.
 *
 * There is no label to anchor on — the name simply sits above the date of
 * birth — so the line immediately preceding the DOB line is taken, after
 * discarding the boilerplate ("GOVERNMENT OF INDIA", "UNIQUE IDENTIFICATION
 * AUTHORITY", the Hindi transliteration line, which OCR renders as noise).
 */
function parseAadhaarName(lines: string[], dobLineIndex: number): string | undefined {
  const BOILERPLATE =
    /government|india|unique|identification|authority|आधार|aadhaar|male|female|dob|year|birth|enrol/i;

  for (let i = dobLineIndex - 1; i >= 0 && i >= dobLineIndex - 4; i -= 1) {
    const line = lines[i]?.trim();
    if (!line || line.length < 3) continue;
    if (BOILERPLATE.test(line)) continue;
    // A real name is mostly letters; a line that is mostly digits or symbols
    // is a reference number or OCR noise off the emblem.
    const letters = (line.match(/[A-Za-z]/g) ?? []).length;
    if (letters / line.length < 0.6) continue;
    return line.replace(/\s+/g, ' ').trim();
  }
  return undefined;
}

export function parseAadhaar(text: string): ExtractedDocumentFields {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  const fields: ExtractedDocumentFields = {};

  // Aadhaar prints the number in 4-4-4 groups; OCR keeps, drops or doubles
  // the separators, so any run of 12 digits with optional gaps is a
  // candidate and Verhoeff decides which one is real.
  const numberMatches = text.matchAll(/\b(\d{4})\s*[-\s]?\s*(\d{4})\s*[-\s]?\s*(\d{4})\b/g);
  for (const match of numberMatches) {
    const digits = `${match[1]}${match[2]}${match[3]}`;
    if (isValidAadhaarNumber(digits)) {
      // Only the last four are ever kept. See the migration's comment on
      // candidate_verification_documents for why.
      fields.aadhaarLast4 = digits.slice(-4);
      break;
    }
  }

  const dob = parseDob(text);
  if (dob) fields.dob = dob;

  const dobLineIndex = lines.findIndex((line) => /\d{2}[/\-.]\d{2}[/\-.]\d{4}|yob|year of birth/i.test(line));
  if (dobLineIndex > 0) {
    const name = parseAadhaarName(lines, dobLineIndex);
    if (name) fields.fullName = name;
  }

  const gender = text.match(/\b(male|female|transgender)\b/i);
  if (gender) fields.gender = gender[1].toLowerCase();

  fields.rawTextSample = text.slice(0, 600);
  return fields;
}

// ---------------------------------------------------------------------------
// Marks cards / degree certificates
// ---------------------------------------------------------------------------

const NAME_LABELS =
  /(?:name\s+of\s+(?:the\s+)?(?:candidate|student|pupil)|candidate(?:'s)?\s+name|student\s+name|name)\s*[:\-]\s*([A-Za-z][A-Za-z .]{2,60})/i;

const INSTITUTION_LABELS =
  /(?:name\s+of\s+(?:the\s+)?(?:school|college|institution|institute)|school|college|institution)\s*[:\-]\s*([A-Za-z][A-Za-z0-9 .,&()-]{4,90})/i;

const BOARD_LABELS =
  /((?:[A-Z][A-Za-z.]*\s+){0,4}(?:board\s+of\s+(?:secondary|higher|school)[A-Za-z ]*|university|board))/i;

const ROLL_LABELS =
  /(?:roll\s*(?:no|number|code)?|register(?:ed)?\s*(?:no|number)|registration\s*(?:no|number)|usn|prn)\s*[:\-.]?\s*([A-Z0-9/-]{4,25})/i;

/**
 * Reads the result off a marks card.
 *
 * Two shapes are looked for and they are not interchangeable. A percentage is
 * a number out of 100; a CGPA is a number out of 10 (or occasionally 4). The
 * unit is carried through rather than converted, because "8.6 CGPA" is not
 * "86%" and writing the latter into a profile a company screens on would be
 * inventing a figure. Where a card prints both, percentage wins as the more
 * universally comparable one.
 */
function parseScore(text: string): { scoreValue: number; scoreType: string } | undefined {
  const percentage = text.match(
    /(?:percentage|percent|total\s+percentage|aggregate)\s*[:\-]?\s*(\d{1,3}(?:\.\d{1,2})?)\s*%?/i,
  );
  if (percentage) {
    const value = Number(percentage[1]);
    if (value > 0 && value <= 100) return { scoreValue: value, scoreType: 'percentage' };
  }

  const bare = text.match(/(\d{1,3}(?:\.\d{1,2})?)\s*%/);
  if (bare) {
    const value = Number(bare[1]);
    if (value > 0 && value <= 100) return { scoreValue: value, scoreType: 'percentage' };
  }

  const cgpa = text.match(/(?:cgpa|sgpa|gpa)\s*[:\-]?\s*(\d{1,2}(?:\.\d{1,2})?)/i);
  if (cgpa) {
    const value = Number(cgpa[1]);
    if (value > 0 && value <= 10) {
      return { scoreValue: value, scoreType: value > 4 ? 'cgpa_10' : 'cgpa_4' };
    }
  }

  return undefined;
}

/**
 * The year the qualification was awarded.
 *
 * Every four-digit year in the document is collected and the latest plausible
 * one is taken: a marks card prints the exam year, the issue date and often
 * the board's founding year, and the award is the most recent of those. The
 * window runs from 1950 to next year — a card can legitimately be issued for
 * an exam session slightly ahead of today's date.
 */
function parsePassingYear(text: string): number | undefined {
  const years = [...text.matchAll(/\b(19[5-9]\d|20[0-4]\d)\b/g)]
    .map((m) => Number(m[1]))
    .filter((year) => year >= 1950 && year <= new Date().getFullYear() + 1);
  if (years.length === 0) return undefined;
  return Math.max(...years);
}

export function parseMarksCard(text: string): ExtractedDocumentFields {
  const fields: ExtractedDocumentFields = {};

  const name = text.match(NAME_LABELS);
  if (name) fields.fullName = name[1].replace(/\s+/g, ' ').trim();

  const institution = text.match(INSTITUTION_LABELS);
  if (institution) fields.institution = institution[1].replace(/\s+/g, ' ').trim();

  const board = text.match(BOARD_LABELS);
  if (board) fields.boardOrUniversity = board[1].replace(/\s+/g, ' ').trim();

  const roll = text.match(ROLL_LABELS);
  if (roll) fields.rollNumber = roll[1].trim();

  const year = parsePassingYear(text);
  if (year) fields.passingYear = year;

  const score = parseScore(text);
  if (score) {
    fields.scoreValue = score.scoreValue;
    fields.scoreType = score.scoreType;
  }

  fields.rawTextSample = text.slice(0, 600);
  return fields;
}

// ---------------------------------------------------------------------------
// Matching
// ---------------------------------------------------------------------------

/** What the candidate typed, for the fields a document can corroborate. */
export interface ClaimedFields {
  fullName?: string | null;
  institution?: string | null;
  boardOrUniversity?: string | null;
  passingYear?: number | null;
  scoreValue?: number | null;
  scoreType?: string | null;
}

export interface MatchOutcome {
  fieldMatches: DocumentFieldMatches;
  /** 0–1: how much of what could be checked actually agreed. */
  confidence: number;
  /** Fields the candidate claimed that the document does not support. */
  mismatched: string[];
}

/** Name agreement is the load-bearing check, so it is weighted accordingly. */
const FIELD_WEIGHTS: Record<string, number> = {
  fullName: 3,
  institution: 2,
  boardOrUniversity: 1,
  passingYear: 2,
  scoreValue: 2,
};

const NAME_MATCH_THRESHOLD = 0.75;
const INSTITUTION_MATCH_THRESHOLD = 0.6;

/**
 * Compares document against claim, field by field.
 *
 * Only fields present on BOTH sides are scored. A document that does not
 * mention the institution is silent on it, not contradicting it — counting
 * silence as a failure would punish candidates for the layout of their own
 * marks card. Silence lowers what can be confirmed, and the confidence
 * denominator reflects that.
 */
export function matchExtractedToClaim(
  extracted: ExtractedDocumentFields,
  claimed: ClaimedFields,
): MatchOutcome {
  const fieldMatches: DocumentFieldMatches = {};
  const mismatched: string[] = [];
  let earned = 0;
  let available = 0;

  const record = (key: string, passed: boolean) => {
    fieldMatches[key] = passed;
    available += FIELD_WEIGHTS[key] ?? 1;
    if (passed) earned += FIELD_WEIGHTS[key] ?? 1;
    else mismatched.push(key);
  };

  if (extracted.fullName && claimed.fullName) {
    record('fullName', nameSimilarity(claimed.fullName, extracted.fullName) >= NAME_MATCH_THRESHOLD);
  }

  if (extracted.institution && claimed.institution) {
    record(
      'institution',
      similarity(claimed.institution, extracted.institution) >= INSTITUTION_MATCH_THRESHOLD,
    );
  }

  if (extracted.boardOrUniversity && claimed.boardOrUniversity) {
    record(
      'boardOrUniversity',
      similarity(claimed.boardOrUniversity, extracted.boardOrUniversity) >=
        INSTITUTION_MATCH_THRESHOLD,
    );
  }

  if (extracted.passingYear && claimed.passingYear) {
    // A year either side: the exam year and the certificate's issue year are
    // routinely different, and which one a candidate types is a coin flip.
    record('passingYear', Math.abs(extracted.passingYear - claimed.passingYear) <= 1);
  }

  if (extracted.scoreValue != null && claimed.scoreValue != null) {
    const sameUnit =
      !extracted.scoreType || !claimed.scoreType || extracted.scoreType === claimed.scoreType;
    // Half a point of slack absorbs rounding and the difference between an
    // aggregate and a total; a materially inflated score still fails.
    const closeEnough = Math.abs(extracted.scoreValue - claimed.scoreValue) <= 0.5;
    record('scoreValue', sameUnit && closeEnough);
  }

  return {
    fieldMatches,
    confidence: available === 0 ? 0 : earned / available,
    mismatched,
  };
}
