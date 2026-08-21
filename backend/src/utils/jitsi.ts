import crypto from 'crypto';

/**
 * End-to-End ATS (Feature 2, Phase 9) — interview rounds run on Jitsi Meet
 * (spec: "free, open-source, no API key"). A meeting is nothing more than
 * a room name both sides open meet.jit.si with — no provisioning call, no
 * account, no key. The room name is opaque (not derived from the job
 * title or candidate name) since meet.jit.si rooms have no access control
 * of their own — anything guessable would let a stranger join.
 */
export function generateJitsiMeetingLink(): string {
  const roomName = `hirepool-${crypto.randomBytes(12).toString('hex')}`;
  return `https://meet.jit.si/${roomName}`;
}
