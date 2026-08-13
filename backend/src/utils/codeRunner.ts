import { ApiError } from './ApiError';
import type { CodeRunCase } from '../models/ContestQuestionResponse';

/**
 * Code execution for the contest module.
 *
 * ── Why this is not just "call Piston" any more ──────────────────────────
 * The contest module was specced on emkc.org's public Piston instance being
 * free and open. It went **whitelist-only on 2026-02-15** and now answers
 * every execute call with 401:
 *
 *   "Public Piston API is now whitelist only as of 2/15/2026..."
 *
 * which surfaced to candidates as "Code execution is not configured on this
 * deployment" — accurate, and useless to someone halfway through a contest.
 *
 * So execution is now provider-agnostic. Two backends are implemented behind
 * one interface, and the runner picks the first that is actually usable:
 *
 *   Judge0   The default. Its public Community Edition endpoint
 *            (https://ce.judge0.com) is open without a key, and the same code
 *            path works against a RapidAPI subscription or a self-hosted
 *            Judge0 by setting JUDGE0_API_URL / JUDGE0_API_KEY.
 *   Piston   Kept, and preferred whenever PISTON_API_URL points at a
 *            self-hosted instance — that is still the best option for anyone
 *            willing to run one container, since it is unmetered.
 *
 * Selection order, highest first:
 *
 *   1. PISTON_API_URL set        → self-hosted Piston (explicit, unmetered)
 *   2. JUDGE0_API_URL/KEY set    → configured Judge0
 *   3. neither                   → public Judge0 CE, best effort
 *
 * The third case is what makes contests work on a fresh deployment with no
 * configuration at all. It is rate limited and occasionally down, which is
 * why `checkRuntimeAvailability` exists and why the test page warns before a
 * candidate writes a solution rather than after.
 *
 * Other tradeoffs handled here rather than discovered in production:
 *
 *  - Every provider is rate limited. Test cases run SEQUENTIALLY, never with
 *    Promise.all: a 10-case hidden suite fired in parallel gets a chunk of its
 *    cases back as 429s, which reads to the candidate as "your code failed"
 *    rather than "we throttled you". Slower but honest.
 *  - These are third parties we don't control. Every call has an explicit
 *    AbortController timeout so an outage can't hold an Express handler — and
 *    with it a pooled DB connection — open indefinitely.
 */

const PISTON_BASE_URL = process.env.PISTON_API_URL || '';
/** Optional bearer token, for a whitelisted or self-hosted Piston. */
const PISTON_API_KEY = process.env.PISTON_API_KEY || '';

const JUDGE0_BASE_URL = process.env.JUDGE0_API_URL || 'https://ce.judge0.com';
/** RapidAPI key, or any bearer the configured Judge0 host expects. */
const JUDGE0_API_KEY = process.env.JUDGE0_API_KEY || '';
/** Only needed for RapidAPI-hosted Judge0, which routes on this header. */
const JUDGE0_API_HOST = process.env.JUDGE0_API_HOST || '';

/** Wall-clock ceiling for one execute call, including provider queueing. */
const REQUEST_TIMEOUT_MS = 20_000;

type Provider = 'piston' | 'judge0';

/**
 * Explicit self-hosted Piston wins; otherwise Judge0, configured or public.
 * Piston is preferred when present because it is unmetered — someone who went
 * to the trouble of hosting it should not silently be sent to a public API.
 */
function activeProvider(): Provider {
  return PISTON_BASE_URL ? 'piston' : 'judge0';
}

/**
 * Languages offered in the editor's selector.
 *
 * Versions are pinned per provider rather than sent as "*" so an upstream
 * upgrade can't silently change the runtime under a candidate mid-contest —
 * a Python release that alters integer division or dict ordering would
 * otherwise start failing previously-passing submissions with no deploy on
 * our side.
 *
 * `judge0Id`s are Judge0 CE's stable language ids.
 */
export const SUPPORTED_LANGUAGES = [
  {
    id: 'python',
    label: 'Python 3',
    version: '3.10.0',
    pistonLanguage: 'python',
    judge0Id: 71,
  },
  { id: 'java', label: 'Java', version: '15.0.2', pistonLanguage: 'java', judge0Id: 62 },
  { id: 'cpp', label: 'C++ 17', version: '10.2.0', pistonLanguage: 'c++', judge0Id: 54 },
  {
    id: 'javascript',
    label: 'JavaScript (Node)',
    version: '18.15.0',
    pistonLanguage: 'javascript',
    judge0Id: 63,
  },
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

/** One execution, normalised across providers. */
interface RunOutcome {
  stdout: string;
  stderr: string;
  /** Non-null when the program never ran because it did not build. */
  compileError: string | null;
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

/** The operator-facing fix, shown when no provider will run anything. */
const NOT_CONFIGURED_MESSAGE =
  'Code execution is unavailable right now. If this persists, set JUDGE0_API_URL (or ' +
  'PISTON_API_URL for a self-hosted Piston) on the backend to a working runner.';

function timeoutSignal(ms: number): { signal: AbortSignal; done: () => void } {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  return { signal: controller.signal, done: () => clearTimeout(timer) };
}

// ---------------------------------------------------------------------------
// Piston
// ---------------------------------------------------------------------------

interface PistonRunResult {
  stdout: string;
  stderr: string;
  output: string;
  code: number | null;
  signal: string | null;
}

interface PistonResponse {
  run: PistonRunResult;
  compile?: PistonRunResult;
  message?: string;
}

async function executeOnPiston(
  language: LanguageId,
  source: string,
  stdin: string,
): Promise<RunOutcome> {
  const config = SUPPORTED_LANGUAGES.find((l) => l.id === language)!;
  const { signal, done } = timeoutSignal(REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(`${PISTON_BASE_URL}/execute`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(PISTON_API_KEY ? { Authorization: PISTON_API_KEY } : {}),
      },
      signal,
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
    // 401/403 is a whitelist rejection, not a transient outage: retrying will
    // never help, so it must not be reported as "try again".
    if (response.status === 401 || response.status === 403) {
      throw ApiError.serviceUnavailable(NOT_CONFIGURED_MESSAGE);
    }
    if (!response.ok) {
      throw ApiError.serviceUnavailable(
        'The code runner is unavailable right now. Please try again.',
      );
    }

    const body = (await response.json()) as PistonResponse;
    return {
      stdout: body.run?.stdout ?? '',
      stderr: body.run?.stderr ?? '',
      compileError: body.compile?.stderr?.trim() || null,
    };
  } catch (err) {
    if (err instanceof ApiError) throw err;
    throw ApiError.serviceUnavailable('The code runner did not respond in time. Please try again.');
  } finally {
    done();
  }
}

// ---------------------------------------------------------------------------
// Judge0
// ---------------------------------------------------------------------------

interface Judge0Response {
  stdout: string | null;
  stderr: string | null;
  compile_output: string | null;
  message: string | null;
  status?: { id: number; description: string };
}

function judge0Headers(): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (JUDGE0_API_KEY) {
    // RapidAPI-hosted Judge0 authenticates on X-RapidAPI-Key; a self-hosted
    // one behind a gateway usually wants a bearer. Both are sent — each host
    // ignores the header it doesn't know, which avoids needing a third env
    // var just to say which style of auth is in play.
    headers['X-RapidAPI-Key'] = JUDGE0_API_KEY;
    headers['Authorization'] = `Bearer ${JUDGE0_API_KEY}`;
  }
  if (JUDGE0_API_HOST) headers['X-RapidAPI-Host'] = JUDGE0_API_HOST;
  return headers;
}

async function executeOnJudge0(
  language: LanguageId,
  source: string,
  stdin: string,
): Promise<RunOutcome> {
  const config = SUPPORTED_LANGUAGES.find((l) => l.id === language)!;
  const { signal, done } = timeoutSignal(REQUEST_TIMEOUT_MS);

  try {
    // `wait=true` runs synchronously and returns the result in one call.
    // Judge0's async mode would mean submit-then-poll, which is strictly worse
    // here: the handler has to wait for the answer either way, and polling
    // just adds round trips and a second failure mode.
    const response = await fetch(
      `${JUDGE0_BASE_URL}/submissions?base64_encoded=false&wait=true`,
      {
        method: 'POST',
        headers: judge0Headers(),
        signal,
        body: JSON.stringify({
          language_id: config.judge0Id,
          source_code: source,
          stdin,
        }),
      },
    );

    if (response.status === 429) {
      throw ApiError.tooManyRequests(
        'The code runner is busy right now — wait a few seconds and run again.',
      );
    }
    if (response.status === 401 || response.status === 403) {
      throw ApiError.serviceUnavailable(NOT_CONFIGURED_MESSAGE);
    }
    if (!response.ok) {
      throw ApiError.serviceUnavailable(
        'The code runner is unavailable right now. Please try again.',
      );
    }

    const body = (await response.json()) as Judge0Response;

    // Judge0 status ids: 6 is "Compilation Error"; 7–12 are runtime signals
    // (SIGSEGV, SIGXFSZ, …) and 13/14 are internal/exec-format errors. Only 6
    // means "this never ran" — the rest produced real output that the case
    // comparison below should judge normally.
    const compileError =
      body.status?.id === 6 ? (body.compile_output || body.message || 'Compilation failed').trim() : null;

    return {
      stdout: body.stdout ?? '',
      // `message` carries things like "Time limit exceeded", which a candidate
      // needs to see and which would otherwise vanish entirely.
      stderr: body.stderr ?? body.message ?? '',
      compileError,
    };
  } catch (err) {
    if (err instanceof ApiError) throw err;
    throw ApiError.serviceUnavailable('The code runner did not respond in time. Please try again.');
  } finally {
    done();
  }
}

// ---------------------------------------------------------------------------
// Provider dispatch
// ---------------------------------------------------------------------------

async function executeOnce(
  language: LanguageId,
  source: string,
  stdin: string,
): Promise<RunOutcome> {
  if (!SUPPORTED_LANGUAGES.some((l) => l.id === language)) {
    throw ApiError.badRequest(`Unsupported language "${language}"`);
  }
  return activeProvider() === 'piston'
    ? executeOnPiston(language, source, stdin)
    : executeOnJudge0(language, source, stdin);
}

/**
 * Cheap "is the runner usable?" probe, so a test containing coding questions
 * can warn the candidate up front instead of letting them write a solution
 * and only discover it can't be executed when they press Submit.
 *
 * Cached, because this is called on every test page load and the answer
 * changes roughly never. The failure result is cached for a much shorter
 * window than the success one, so bringing a runner online is picked up in a
 * minute rather than staying "unavailable" for an hour.
 */
let availabilityCache: { ok: boolean; checkedAt: number; detail: string | null } | null = null;
const AVAILABILITY_TTL_OK_MS = 10 * 60 * 1000;
const AVAILABILITY_TTL_FAIL_MS = 60 * 1000;

export async function checkRuntimeAvailability(): Promise<{ ok: boolean; detail: string | null }> {
  const ttl = availabilityCache?.ok ? AVAILABILITY_TTL_OK_MS : AVAILABILITY_TTL_FAIL_MS;
  if (availabilityCache && Date.now() - availabilityCache.checkedAt < ttl) {
    return { ok: availabilityCache.ok, detail: availabilityCache.detail };
  }

  // A real (trivial) execution, not a capabilities endpoint: Piston's
  // /runtimes answers happily even on the whitelist-only public instance, so
  // probing it would report "available" for a host that rejects every execute
  // call — which is exactly the failure this probe exists to catch.
  let ok = false;
  let detail: string | null = null;
  try {
    const outcome = await executeOnce('python', 'print(1)', '');
    ok = outcome.compileError === null;
    detail = ok ? null : NOT_CONFIGURED_MESSAGE;
  } catch (err) {
    ok = false;
    detail =
      err instanceof ApiError ? err.message : 'The code runner is unreachable right now.';
  }

  availabilityCache = { ok, checkedAt: Date.now(), detail };
  return { ok, detail };
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
    if (outcome.compileError) {
      return {
        cases: [],
        passedCount: 0,
        totalCount: cases.length,
        compileError: outcome.compileError.slice(0, 4000),
      };
    }

    const passed = outputMatches(outcome.stdout, testCase.expectedOutput ?? '');
    if (passed) passedCount += 1;

    results.push(
      revealDetails
        ? {
            passed,
            stdin: testCase.stdin,
            expectedOutput: testCase.expectedOutput,
            actualOutput: outcome.stdout.slice(0, 2000),
            stderr: outcome.stderr.slice(0, 2000) || undefined,
          }
        : { passed, hidden: true },
    );
  }

  return { cases: results, passedCount, totalCount: cases.length, compileError: null };
}
