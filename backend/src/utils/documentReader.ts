import { createWorker } from 'tesseract.js';

/**
 * Reads text out of a document the candidate has linked, without ever storing
 * the document.
 *
 * The whole pipeline is deliberately transient: fetch the bytes, pull the text
 * out, throw the bytes away, keep only the handful of fields that were parsed.
 * That is a product decision as much as a storage one — see the comment on
 * `candidate_verification_documents` in the migration. Nothing in this module
 * writes to disk or to the database.
 *
 * Two readers, picked by what actually came back over the wire:
 *
 *   PDF   → pdf-parse, which reads the embedded text layer directly. This is
 *           the good case and it is the common one for anything issued
 *           digitally (DigiLocker documents, university e-marksheets): the
 *           text is exact, not guessed, so the match is reliable.
 *   image → tesseract.js. This is a phone photo of a paper certificate, and
 *           the output is a best guess. Everything downstream treats it as
 *           such — see confidence handling in verificationController.
 */

/**
 * 12 MB. Comfortably more than a scan of a marks card and far less than
 * anything that would tie up the process. Enforced twice below: once on the
 * advertised Content-Length, and again while reading, because a server is
 * free to lie about (or omit) the header.
 */
const MAX_BYTES = 12 * 1024 * 1024;

/** A hostile or merely dead link must not hold a request open indefinitely. */
const FETCH_TIMEOUT_MS = 20_000;

export interface ReadDocumentResult {
  text: string;
  /**
   * 0–1, and only meaningful for the OCR path — a text-layer PDF read is
   * exact, so it reports 1. This is the reader's confidence in the
   * characters, not in whether the document says what the candidate claims.
   */
  readConfidence: number;
  kind: 'pdf' | 'image';
}

export class DocumentReadError extends Error {
  /** Safe to show the candidate — these all describe something they can fix. */
  constructor(message: string) {
    super(message);
    this.name = 'DocumentReadError';
  }
}

/**
 * Rewrites a Google Drive *share* link into something that returns bytes.
 *
 * A candidate pastes what the Drive "Copy link" button gave them, which is a
 * viewer page — fetching it returns HTML, not the file. Both of Drive's URL
 * shapes carry the file id, so it is extracted and swapped into the download
 * endpoint. Anything that is not a Drive link is returned untouched: a direct
 * link to a PDF on a university site is already fine.
 */
export function toFetchableUrl(link: string): string {
  const trimmed = link.trim();

  //   https://drive.google.com/file/d/<ID>/view?usp=sharing
  const filePath = trimmed.match(/drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/);
  //   https://drive.google.com/open?id=<ID>   /   .../uc?id=<ID>
  const idParam = trimmed.match(/drive\.google\.com\/(?:open|uc)\?(?:[^#]*&)?id=([a-zA-Z0-9_-]+)/);

  const fileId = filePath?.[1] ?? idParam?.[1];
  if (fileId) {
    return `https://drive.google.com/uc?export=download&id=${fileId}`;
  }

  return trimmed;
}

/** Rejects anything that isn't a plain http(s) URL to a public host. */
export function assertSafeUrl(rawUrl: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new DocumentReadError('That does not look like a valid link.');
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new DocumentReadError('Only http and https links can be checked.');
  }

  // SSRF guard. This endpoint takes a URL from an unauthenticated-ish source
  // (any signed-up candidate) and makes the server fetch it, which is exactly
  // the shape that turns a server into a proxy for scanning its own private
  // network — cloud metadata endpoints, internal admin panels, the database
  // host. Hostname filtering is a coarse defence (it cannot stop a public
  // DNS name that resolves to a private address, nor a redirect to one), so
  // `redirect: 'manual'`-style re-checking happens in fetchDocument below.
  const host = parsed.hostname.toLowerCase();
  const isBlockedHost =
    host === 'localhost' ||
    host === '::1' ||
    host.endsWith('.localhost') ||
    host.endsWith('.internal') ||
    host.endsWith('.local') ||
    /^127\./.test(host) ||
    /^10\./.test(host) ||
    /^192\.168\./.test(host) ||
    /^169\.254\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host) ||
    /^0\./.test(host) ||
    /^\[?fd[0-9a-f]{2}:/i.test(host) ||
    /^\[?fe80:/i.test(host);

  if (isBlockedHost) {
    throw new DocumentReadError('That link points somewhere we cannot reach. Use a public link.');
  }

  return parsed;
}

interface FetchedDocument {
  bytes: Buffer;
  contentType: string;
}

async function fetchDocument(rawUrl: string): Promise<FetchedDocument> {
  let url = assertSafeUrl(rawUrl).toString();

  // Redirects are followed by hand, one hop at a time, re-running the host
  // check on each: `redirect: 'follow'` would let a public URL bounce the
  // server onto 169.254.169.254 with the guard above never seeing it.
  // Drive's download endpoint legitimately redirects, so this cannot simply
  // be disallowed.
  let response: Response | null = null;
  for (let hop = 0; hop < 5; hop += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      response = await fetch(url, {
        redirect: 'manual',
        signal: controller.signal,
        headers: {
          // Drive serves an interstitial to clients it doesn't recognise.
          'User-Agent': 'Mozilla/5.0 (compatible; HirepoolVerifier/1.0)',
        },
      });
    } catch (err) {
      const aborted = err instanceof Error && err.name === 'AbortError';
      throw new DocumentReadError(
        aborted
          ? 'The link took too long to respond. Check that it opens for anyone.'
          : 'We could not open that link. Check that it is shared publicly.',
      );
    } finally {
      clearTimeout(timer);
    }

    const location = response.headers.get('location');
    if (response.status >= 300 && response.status < 400 && location) {
      url = assertSafeUrl(new URL(location, url).toString()).toString();
      continue;
    }
    break;
  }

  if (!response) {
    throw new DocumentReadError('We could not open that link.');
  }

  if (response.status === 403 || response.status === 401) {
    throw new DocumentReadError(
      'That document is private. Set its sharing to "Anyone with the link can view" and try again.',
    );
  }
  if (!response.ok) {
    throw new DocumentReadError(
      `That link returned an error (${response.status}). Check that it still works.`,
    );
  }

  const declaredLength = Number(response.headers.get('content-length') ?? '0');
  if (declaredLength > MAX_BYTES) {
    throw new DocumentReadError('That file is too large — keep it under 12 MB.');
  }

  const contentType = (response.headers.get('content-type') ?? '').toLowerCase();

  // Drive hands back an HTML page rather than a 403 when a file isn't shared,
  // so a "successful" response can still be the sign-in wall. Reporting it as
  // a sharing problem is more useful than "we could not read that document".
  if (contentType.includes('text/html')) {
    throw new DocumentReadError(
      'That link opened a web page rather than a file. Use a direct link to the document, shared as "Anyone with the link can view".',
    );
  }

  const arrayBuffer = await response.arrayBuffer();
  if (arrayBuffer.byteLength > MAX_BYTES) {
    throw new DocumentReadError('That file is too large — keep it under 12 MB.');
  }

  return { bytes: Buffer.from(arrayBuffer), contentType };
}

/** True for a buffer that starts with the PDF magic number. */
function looksLikePdf(bytes: Buffer, contentType: string): boolean {
  if (contentType.includes('pdf')) return true;
  return bytes.subarray(0, 5).toString('latin1') === '%PDF-';
}

async function readPdfText(bytes: Buffer): Promise<string> {
  // Required lazily. pdf-parse runs a self-test against a bundled sample file
  // at import time when it thinks it is the main module, which throws in some
  // bundled/serverless layouts; requiring it only when a PDF actually arrives
  // keeps that out of the boot path entirely.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const pdfParse = require('pdf-parse') as (b: Buffer) => Promise<{ text: string }>;
  const parsed = await pdfParse(bytes);
  return parsed.text ?? '';
}

async function readImageText(bytes: Buffer): Promise<{ text: string; confidence: number }> {
  // A worker per call rather than a shared long-lived one: tesseract workers
  // hold a few hundred MB of language data, and this runs a handful of times
  // a day per candidate, not per request. Terminating it in `finally` is what
  // keeps that memory from being the app's new baseline.
  const worker = await createWorker('eng');
  try {
    const { data } = await worker.recognize(bytes);
    return {
      text: data.text ?? '',
      // tesseract reports 0–100.
      confidence: Math.max(0, Math.min(1, (data.confidence ?? 0) / 100)),
    };
  } finally {
    await worker.terminate();
  }
}

/**
 * Fetches the linked document and returns its text. The bytes are local to
 * this function and are unreachable once it returns.
 */
export async function readDocument(link: string): Promise<ReadDocumentResult> {
  const { bytes, contentType } = await fetchDocument(toFetchableUrl(link));

  if (looksLikePdf(bytes, contentType)) {
    const text = await readPdfText(bytes);
    if (text.trim().length < 20) {
      // A PDF with no text layer is a scan wrapped in a PDF. Rasterising it
      // would need a native dependency (poppler/ImageMagick) that this
      // deployment does not have, so the honest answer is to ask for an
      // image instead of silently returning nothing and calling it a
      // mismatch.
      throw new DocumentReadError(
        'That PDF has no readable text — it looks like a scan. Upload a photo (JPG or PNG) of the document instead.',
      );
    }
    return { text, readConfidence: 1, kind: 'pdf' };
  }

  if (!contentType.startsWith('image/') && contentType !== '') {
    throw new DocumentReadError(
      'That file type cannot be read. Link a PDF, JPG or PNG of the document.',
    );
  }

  const { text, confidence } = await readImageText(bytes);
  if (text.trim().length < 10) {
    throw new DocumentReadError(
      'We could not read any text in that image. Try a sharper, well-lit photo taken straight on.',
    );
  }
  return { text, readConfidence: confidence, kind: 'image' };
}
