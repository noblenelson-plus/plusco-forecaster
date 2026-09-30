// lib/format/stable-hash.ts

/**
 * Order-independent fingerprint of a plain JSON-like value (Firestore data).
 * Used by the bulk backups to tell whether a section changed since it was
 * written: two reads of the same data hash equal even if their map keys come
 * back in a different order. Arrays keep their order (it is meaningful).
 */

/** JSON with object keys sorted recursively; `undefined` → null. */
export function stableStringify(value: unknown): string {
  if (value === undefined || value === null) return "null";
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj)
      .filter((k) => obj[k] !== undefined)
      .sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

/** SHA-256 (hex) of the value's stable serialization. */
export async function stableHash(value: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(stableStringify(value));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
