export function toRepoUrl(url: string): string {
  let result = url;
  if (result.startsWith('git+')) {
    result = result.slice(4);
  }
  if (result.endsWith('.git')) {
    result = result.slice(0, -4);
  }
  return result;
}

export function formatUptime(ms: number | null): string {
  if (ms === null) {
    return 'unknown';
  }

  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  const remainingMinutes = minutes % 60;
  const remainingHours = hours % 24;

  if (days > 0) {
    return `${days}d ${remainingHours}h ${remainingMinutes}m`;
  }

  if (hours > 0) {
    return `${hours}h ${remainingMinutes}m`;
  }

  if (minutes > 0) {
    return `${minutes}m`;
  }

  return '0m';
}

const TRUNCATION_NOTE = '\n*(preview truncated)*';

/**
 * Joins a prefix and user-supplied body so the result never exceeds Discord's message limit.
 * An over-long body is cut with an ellipsis and followed by a truncation note.
 */
export function fitMessage(prefix: string, body: string, max = 2000): string {
  if (prefix.length + body.length <= max) {
    return prefix + body;
  }
  const room = Math.max(0, max - prefix.length - TRUNCATION_NOTE.length - 1);
  return `${prefix}${body.slice(0, room)}…${TRUNCATION_NOTE}`;
}
