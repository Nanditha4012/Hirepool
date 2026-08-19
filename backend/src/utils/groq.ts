import { z } from 'zod';
import { env } from '../config/env';

/**
 * True iff a Groq API key is configured. Callers MUST check this before
 * calling parseJobDescription() and record job_requirements_parsed.parseStatus
 * = 'unavailable' instead — this mirrors the "optional external service creds
 * that must not crash the app at boot" pattern in config/env.ts (see
 * isRazorpayConfigured/isEmailConfigured/isDigilockerConfigured).
 */
export function isGroqConfigured(): boolean {
  return Boolean(env.GROQ_API_KEY);
}

const GROQ_CHAT_COMPLETIONS_URL = 'https://api.groq.com/openai/v1/chat/completions';

const parsedRequirementsSchema = z.object({
  requiredSkills: z.array(z.string()).default([]),
  role: z.string().nullable().default(null),
  minimumExperienceYears: z.number().nullable().default(null),
  domain: z.string().nullable().default(null),
});

export type ParsedJobRequirements = z.infer<typeof parsedRequirementsSchema>;

/**
 * Sends the job title + description to Groq's OpenAI-compatible chat
 * completions endpoint, using the given prompt template (pulled from
 * site_settings.jd_parsing_prompt_template — admin-editable, never
 * hardcoded here) as the system instruction, with JSON response format
 * forced so the reply is parseable structured data rather than free text.
 *
 * Throws on any failure (network, non-2xx, unparseable/invalid JSON) —
 * callers are expected to catch this and record
 * job_requirements_parsed.parseStatus = 'failed' with the error message,
 * rather than letting a flaky JD-parsing call fail the whole job-creation
 * request.
 */
export async function parseJobDescription(
  promptTemplate: string,
  title: string,
  description: string,
): Promise<ParsedJobRequirements> {
  if (!isGroqConfigured()) {
    throw new Error(
      'parseJobDescription() called while Groq is not configured — callers must check isGroqConfigured() first',
    );
  }

  const response = await fetch(GROQ_CHAT_COMPLETIONS_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.GROQ_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: env.GROQ_MODEL,
      response_format: { type: 'json_object' },
      temperature: 0,
      messages: [
        { role: 'system', content: promptTemplate },
        { role: 'user', content: `Job title: ${title}\n\nJob description:\n${description}` },
      ],
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`Groq API returned ${response.status}: ${body.slice(0, 500)}`);
  }

  const payload = (await response.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const content = payload.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error('Groq API response had no message content');
  }

  let raw: unknown;
  try {
    raw = JSON.parse(content);
  } catch {
    throw new Error('Groq API response content was not valid JSON');
  }

  return parsedRequirementsSchema.parse(raw);
}
