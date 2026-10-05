const ENFORCEMENT_WINDOW_MS = 5 * 60 * 1000;

export class HoneyPotEnforcementService {
  private static readonly activeEnforcements = new Map<string, NodeJS.Timeout>();

  private static getKey(serverId: string, userId: string): string {
    return `${serverId}:${userId}`;
  }

  public static begin(serverId: string, userId: string): boolean {
    const key = this.getKey(serverId, userId);
    if (this.activeEnforcements.has(key)) {
      return false;
    }

    const timeout = setTimeout(() => {
      this.activeEnforcements.delete(key);
    }, ENFORCEMENT_WINDOW_MS);
    timeout.unref();

    this.activeEnforcements.set(key, timeout);
    return true;
  }

  public static isActive(serverId: string, userId: string): boolean {
    return this.activeEnforcements.has(this.getKey(serverId, userId));
  }

  public static cancel(serverId: string, userId: string): void {
    const key = this.getKey(serverId, userId);
    const timeout = this.activeEnforcements.get(key);
    if (timeout) {
      clearTimeout(timeout);
      this.activeEnforcements.delete(key);
    }
  }
}
