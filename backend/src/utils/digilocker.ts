import crypto from 'crypto';
import { env } from '../config/env';
import { ApiError } from './ApiError';
import type { ExtractedDocumentFields } from '../models/CandidateVerificationDocument';

/**
 * DigiLocker hand-off.
 *
 * DigiLocker is the right way to verify an Indian candidate's identity and
 * qualifications: the documents come signed by the issuer, so there is nothing
 * to OCR and nothing to guess. It is also not something an application can
 * simply start calling — access requires a partner agreement with NeGD and an
 * application approved on the Meripehchaan partner portal, which issues the
 * client id and secret this module reads.
 *
 * So this is written the way the Razorpay and SMTP integrations in this
 * codebase already are: complete, dormant, and gated on
 * `isDigilockerConfigured()`. With no credentials set, every entry point
 * returns a clear "not available yet" and candidates use the document-link +
 * OCR path, which needs no third party at all. Adding the credentials to the
 * environment is the entire activation step — no code change.
 *
 * Flow implemented: OAuth 2.0 authorization code with PKCE (S256), which is
 * what the partner API mandates.
 *
 *   1. digilockerStart      → build an authorize URL, keep the verifier
 *   2. candidate authorises on DigiLocker, comes back with `code`
 *   3. exchangeCodeForToken → code + verifier → access token
 *   4. fetchIssuedDocuments → the list of documents the issuer has signed
 *   5. fetchDocumentFields  → the parsed fields for one of them
 */

export function isDigilockerConfigured(): boolean {
  return Boolean(
    env.DIGILOCKER_CLIENT_ID && env.DIGILOCKER_CLIENT_SECRET && env.DIGILOCKER_REDIRECT_URI,
  );
}

/** Thrown by every entry point when credentials are absent. */
export function assertDigilockerConfigured(): void {
  if (!isDigilockerConfigured()) {
    throw ApiError.badRequest(
      'DigiLocker verification is not enabled yet. Verify with a document link instead.',
    );
  }
}

export interface PkcePair {
  verifier: string;
  challenge: string;
}

/**
 * PKCE pair. The verifier is the secret held by the server for the duration of
 * the flow; only its SHA-256 hash travels to DigiLocker, so an intercepted
 * authorization code is useless without it.
 */
export function createPkcePair(): PkcePair {
  const verifier = crypto.randomBytes(32).toString('base64url');
  const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
  return { verifier, challenge };
}

export function buildAuthorizeUrl(state: string, challenge: string): string {
  const url = new URL('/public/oauth2/1/authorize', env.DIGILOCKER_BASE_URL);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('client_id', env.DIGILOCKER_CLIENT_ID);
  url.searchParams.set('redirect_uri', env.DIGILOCKER_REDIRECT_URI);
  url.searchParams.set('state', state);
  url.searchParams.set('code_challenge', challenge);
  url.searchParams.set('code_challenge_method', 'S256');
  // The two scopes this product needs and no more: who they are, and what
  // documents an issuer has signed for them.
  url.searchParams.set('scope', 'avs_parent files.issueddocs');
  return url.toString();
}

interface TokenResponse {
  access_token: string;
  expires_in: number;
  /** Present on the partner API; carries the verified name/DOB. */
  digilockerid?: string;
  name?: string;
  dob?: string;
  gender?: string;
}

async function digilockerFetch<T>(
  path: string,
  init: RequestInit & { accessToken?: string } = {},
): Promise<T> {
  const { accessToken, ...rest } = init;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20_000);

  try {
    const response = await fetch(new URL(path, env.DIGILOCKER_BASE_URL), {
      ...rest,
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        ...rest.headers,
      },
    });

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      // The upstream body is logged, not returned: it can carry identifiers,
      // and a candidate cannot act on a DigiLocker error code anyway.
      console.error('[digilocker] %s %s → %s %s', rest.method ?? 'GET', path, response.status, body);
      throw ApiError.badRequest(
        'DigiLocker could not complete that request. Please try again, or verify with a document link.',
      );
    }

    return (await response.json()) as T;
  } catch (err) {
    if (err instanceof ApiError) throw err;
    const aborted = err instanceof Error && err.name === 'AbortError';
    throw ApiError.badRequest(
      aborted
        ? 'DigiLocker did not respond in time. Please try again.'
        : 'Could not reach DigiLocker. Please try again later.',
    );
  } finally {
    clearTimeout(timer);
  }
}

export async function exchangeCodeForToken(
  code: string,
  codeVerifier: string,
): Promise<TokenResponse> {
  assertDigilockerConfigured();

  const body = new URLSearchParams({
    code,
    grant_type: 'authorization_code',
    client_id: env.DIGILOCKER_CLIENT_ID,
    client_secret: env.DIGILOCKER_CLIENT_SECRET,
    redirect_uri: env.DIGILOCKER_REDIRECT_URI,
    code_verifier: codeVerifier,
  });

  return digilockerFetch<TokenResponse>('/public/oauth2/1/token', {
    method: 'POST',
    body,
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  });
}

export interface IssuedDocument {
  name: string;
  type: string;
  uri: string;
  issuer: string;
  issuerid: string;
  date?: string;
}

export async function fetchIssuedDocuments(accessToken: string): Promise<IssuedDocument[]> {
  const result = await digilockerFetch<{ items?: IssuedDocument[] }>(
    '/public/oauth2/2/files/issued',
    { accessToken },
  );
  return result.items ?? [];
}

/**
 * The identity DigiLocker itself vouches for, mapped onto the same shape the
 * OCR path produces.
 *
 * Downstream code then treats a DigiLocker result and an OCR result
 * identically — same matcher, same field-match record, same verdict — with
 * the only difference being that this one arrives with confidence 1 because
 * the issuer signed it. That symmetry is the reason both paths can exist
 * without doubling the verification logic.
 */
export function tokenToExtractedFields(token: TokenResponse): ExtractedDocumentFields {
  const fields: ExtractedDocumentFields = {};
  if (token.name) fields.fullName = token.name;
  if (token.dob) fields.dob = token.dob;
  if (token.gender) fields.gender = token.gender;
  return fields;
}
