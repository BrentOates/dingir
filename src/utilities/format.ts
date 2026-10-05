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
