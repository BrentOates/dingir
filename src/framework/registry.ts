/** Throws if two registry entries share a name. `kind` is only used in the error message. */
export function validateRegistry(kind: string, entries: readonly { name: string }[]): void {
  const seen = new Set<string>();
  for (const entry of entries) {
    if (typeof entry?.name !== 'string' || entry.name.length === 0) {
      throw new Error(`Every ${kind} must have a non-empty name`);
    }
    if (seen.has(entry.name)) {
      throw new Error(`Duplicate ${kind} "${entry.name}"`);
    }
    seen.add(entry.name);
  }
}
