export type AccessOutcome = 'ok' | 'gone' | 'transient';

export interface AccessState {
  accessFailureCount: number;
  firstAccessFailureAt: Date | null;
}

export interface RetentionPolicyConfig {
  minFailures: number;
  graceDays: number;
}

const GONE_CODES = new Set([50001, 10004]);
const DAY_MS = 24 * 60 * 60 * 1000;

export const classifyGuildFetchError = (err: unknown): 'gone' | 'transient' => {
  const code =
    typeof err === 'object' && err !== null ? (err as { code?: unknown }).code : undefined;
  return typeof code === 'number' && GONE_CODES.has(code) ? 'gone' : 'transient';
};

export const nextAccessState = (
  state: AccessState,
  outcome: AccessOutcome,
  now: Date,
  policy: RetentionPolicyConfig
): AccessState & { purge: boolean } => {
  if (outcome === 'ok') {
    return { accessFailureCount: 0, firstAccessFailureAt: null, purge: false };
  }
  if (outcome === 'transient') {
    return { ...state, purge: false };
  }
  const accessFailureCount = state.accessFailureCount + 1;
  const firstAccessFailureAt = state.firstAccessFailureAt ?? now;
  const elapsed = now.getTime() - firstAccessFailureAt.getTime();
  const purge = accessFailureCount >= policy.minFailures && elapsed >= policy.graceDays * DAY_MS;
  return { accessFailureCount, firstAccessFailureAt, purge };
};
