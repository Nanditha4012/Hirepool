import { ApiError } from './ApiError';
import type { CodeRunCase } from '../models/ContestQuestionResponse';

/**
 * Code execution via Piston.
 *
 * ── IMPORTANT: the public instance is no longer open ─────────────────────
 * emkc.org/api/v2/piston went **whitelist-only on 2026-02-15**. Calling it
 * without authorisation now returns 401 with:
 *
 *   "Public Piston API is now whitelist only as of 2/15/2026. Please contact
 *    EngineerMan on Discord with use case justification or consider hosting
 *    your own Piston instance."
 *
 * That was verified against the live endpoint while building this, so the
 * "free, no API key" assumption the contest module was specced on no longer
 * holds. Two supported ways forward, both configured here, neither needing a
 * code change:
 *
 *   1. Self-host Piston (Docker, ~one command) and point PISTON_API_URL at it.
 *      This is the zero-cost path and the one the Piston project now
 *      recommends.
 *   2. Get the public instance to whitelist you, or use any Piston-compatible
 *      host, and set PISTON_API_KEY if it wants an Authorization header.
 *
 * Until one of those is configured, coding questions degrade gracefully: the
 * candidate can still write and save code, the rest of the test grades
 * normally, and Run/Submit return a clear, actionable message instead of a
 * generic failure. MCQ and interactive questions are entirely unaffected.
 *
 * Other tradeoffs handled here rather than discovered in production:
 *
 *  - Piston is rate limited. Test cases are therefore executed SEQUENTIALLY,
 *    not with Promise.all: a 10-case hidden suite fired in parallel gets a
 *    chunk of its cases back as 429s, which would read to the candidate as
 *    "your code failed" rather than "we throttled you". Slower but honest.
 *  - It is a third party we don't control. Every call has an explicit timeout
 *    (AbortController) so an outage can't hold an Express handler — and with
 *    it a DB connection — open indefinitely.
 */

const PISTON_BASE_URL = process.env.PISTON_API_URL || 'https://emkc.org/api/v2/piston';

/** Optional bearer token, for a whitelisted or self-hosted instance. */
const PISTON_API_KEY = process.env.PISTON_API_KEY || '';

/** Wall-clock ceiling for one execute call, including Piston's own queueing. */
const REQUEST_TIMEOUT_MS = 20_000;

/**
 * Languages offered in the editor's selector.
 *
 * Versions are pinned rather than sent as "*" so a Piston-side upgrade can't
 * silently change the runtime under a candidate mid-contest (e.g. a Python
 * release that alters integer division or dict ordering would quietly start
 * failing previously-passing submissions).
 */
export const SUPPORTED_LANGUAGES = [
  { id: 'python', label: 'Python 3', version: '3.10.0', pistonLanguage: 'python' },
  { id: 'java', label: 'Java 15', version: '15.0.2', pistonLanguage: 'java' },
  { id: 'cpp', label: 'C++ 17', version: '10.2.0', pistonLanguage: 'c++' },
  { id: 'javascript', label: 'JavaScript (Node)', version: '18.15.0', pistonLanguage: 'javascript' },
] as const;

export type LanguageId = (typeof SUPPORTED_LANGUAGES)[number]['id'];

export function isSupportedLanguage(value: string): value is LanguageId {
  return SUPPORTED_LANGUAGES.some((l) => l.id === value);
}

/** Piston needs a filename with the right extension to pick a compiler. */
const FILE_NAMES: Record<LanguageId, string> = {
  python: 'main.py',
  // Piston's Java runner compiles whatever public class it finds; the file
  // name must match, so problem starter code standardises on `Main`.
  java: 'Main.java',
  cpp: 'main.cpp',
  javascript: 'main.js',
};

interface PistonRunResult {
  stdout: string;
  stderr: string;
  output: string;
  code: number | null;
  signal: string | null;
}

interface PistonResponse {
  language: string;
  version: string;
  run: PistonRunResult;
  compile?: PistonRunResult;
  message?: string;
}

/**
 * Trailing-whitespace-insensitive comparison.
 *
 * Judged output almost always differs from expected output by a trailing
 * newline (`print` adds one, the stored expected value usually doesn't) or by
 * trailing spaces on a line. Failing a correct solution over that would make
 * the judge feel broken, so both sides are normalised: trailing whitespace
 * stripped per line, then trailing blank lines stripped.
 */
export function outputMatches(actual: string, expected: string): boolean {
  const normalize = (value: string) =>
    value
      .replace(/\r\n/g, '\n')
      .split('\n')
      .map((line) => line.replace(/\s+$/, ''))
      .join('\n')
      .replace(/\n+$/, '');

  return normalize(actual) === normalize(expected);
}

async function executeOnce(
  language: LanguageId,
  source: string,
  stdin: string,
): Promise<PistonResponse> {
  const config = SUPPORTED_LANGUAGES.find((l) => l.id === language);
  if (!config) {
    throw ApiError.badRequest(`Unsupported language "${language}"`);
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(`${PISTON_BASE_URL}/execute`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(PISTON_API_KEY ? { Authorization: PISTON_API_KEY } : {}),
      },
      signal: controller.signal,
      body: JSON.stringify({
        language: config.pistonLanguage,
        version: config.version,
        files: [{ name: FILE_NAMES[language], content: source }],
        stdin,
      }),
    });

    if (response.status === 429) {
      throw ApiError.tooManyRequests(
        'The code runner is busy right now — wait a few seconds and run again.',
      );
    }
    // 401/403 is the whitelist rejection described in this file's header, not
    // a transient outage. Surfaced distinctly (and with the operator-facing
    // fix spelled out) because retrying will never help — the message a
    // candidate would otherwise see is "try again", which is false.
    if (response.status === 401 || response.status === 403) {
      throw ApiError.serviceUnavailable(
        'Code execution is not configured on this deployment. The public Piston API became ' +
          'whitelist-only on 2026-02-15 — set PISTON_API_URL to a self-hosted Piston instance ' +
          '(or PISTON_API_KEY for a whitelisted one) to enable Run and Submit.',
      );
    }
    if (!response.ok) {
      throw ApiError.serviceUnavailable('The code runner is unavailable right now. Please try again.');
    }

    return (await response.json()) as PistonResponse;
  } catch (err) {
    if (err instanceof ApiError) throw err;
    // AbortError (our timeout) and any network-level failure both land here.
    throw ApiError.serviceUnavailable('The code runner did not respond in time. Please try again.');
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Cheap "is the runner usable?" probe, so a test containing coding questions
 * can warn the candidate up front instead of letting them write a solution
 * and only discover it can't be executed when they press Submit.
 *
 * Cached, because this is called on every test page load and the answer
 * changes roughly never. The failure result is cached for a much shorter
 * window than the success one, so bringing a runner online is picked up
 * quickly rather than staying "unavailable" for an hour.
 */
let availabilityCache: { ok: boolean; checkedAt: number; detail: string | null } | null = null;
const AVAILABILITY_TTL_OK_MS = 10 * 60 * 1000;
const AVAILABILITY_TTL_FAIL_MS = 60 * 1000;

export async function checkRuntimeAvailability(): Promise<{ ok: boolean; detail: string | null }> {
  const ttl = availabilityCache?.ok ? AVAILABILITY_TTL_OK_MS : AVAILABILITY_TTL_FAIL_MS;
  if (availabilityCache && Date.now() - availabilityCache.checkedAt < ttl) {
    return { ok: availabilityCache.ok, detail: availabilityCache.detail };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    // A trivial execution rather than GET /runtimes: /runtimes answers even on
    // the whitelist-only public instance, so it would report "available" for a
    // host that rejects every actual execute call.
    const response = await fetch(`${PISTON_BASE_URL}/execute`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(PISTON_API_KEY ? { Authorization: PISTON_API_KEY } : {}),
      },
      signal: controller.signal,
      body: JSON.stringify({
        language: 'python',
        version: '3.10.0',
        files: [{ name: 'main.py', content: 'pass' }],
        stdin: '',
      }),
    });

    const ok = response.ok;
    const detail = ok
      ? null
      : response.status === 401 || response.status === 403
        ? 'Code execution is not configured on this deployment (the public Piston API is whitelist-only since 2026-02-15). Set PISTON_API_URL to a self-hosted instance to enable Run and Submit.'
        : 'The code runner is unreachable right now.';
    availabilityCache = { ok, checkedAt: Date.now(), detail };
    return { ok, detail };
  } catch {
    availabilityCache = {
      ok: false,
      checkedAt: Date.now(),
      detail: 'The code runner is unreachable right now.',
    };
    return { ok: false, detail: availabilityCache.detail };
  } finally {
    clearTimeout(timer);
  }
}

export interface ExecuteCasesResult {
  cases: CodeRunCase[];
  passedCount: number;
  totalCount: number;
  compileError: string | null;
}

/**
 * Runs `source` against each test case in order and reports per-case results.
 *
 * `revealDetails` is the difference between Run and Submit: sample cases show
 * the candidate their input, expected and actual output; hidden cases report
 * nothing but pass/fail, so the grading suite can't be reverse-engineered by
 * submitting a program that just echoes stdin.
 */
export async function executeAgainstCases(
  language: LanguageId,
  source: string,
  cases: { stdin: string; expectedOutput: string }[],
  revealDetails: boolean,
): Promise<ExecuteCasesResult> {
  const results: CodeRunCase[] = [];
  let passedCount = 0;

  for (const testCase of cases) {
    const outcome = await executeOnce(language, source, testCase.stdin ?? '');

    // A compile failure is a property of the program, not of one test case —
    // report it once and stop rather than burning the whole (rate-limited)
    // suite on a program that cannot run at all.
    const compileStderr = outcome.compile?.stderr?.trim();
    if (compileStderr) {
      return {
        cases: [],
        passedCount: 0,
        totalCount: cases.length,
        compileError: compileStderr.slice(0, 4000),
      };
    }

    const actual = outcome.run?.stdout ?? '';
    const passed = outputMatches(actual, testCase.expectedOutput ?? '');
    if (passed) passedCount += 1;

    results.push(
      revealDetails
        ? {
            passed,
            stdin: testCase.stdin,
            expectedOutput: testCase.expectedOutput,
            actualOutput: actual.slice(0, 2000),
            stderr: (outcome.run?.stderr ?? '').slice(0, 2000) || undefined,
          }
        : { passed, hidden: true },
    );
  }

  return { cases: results, passedCount, totalCount: cases.length, compileError: null };
}
