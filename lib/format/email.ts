// lib/format/email.ts

/**
 * Email normalization — the single rule for every stored or compared email
 * (users doc ids, CL_Business_Lead / CL_Digital_Lead, CL_Collaborators,
 * CL_Team_Emails, dashboard grants). Security rules compare against the
 * lowercased token email, so anything stored un-normalized silently fails to
 * match: always go through these helpers.
 */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Trimmed + lowercased. Returns "" for null / undefined / blank input. */
export function normalizeEmail(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

/** True when the value, once normalized, looks like an email address. */
export function isValidEmail(value: string | null | undefined): boolean {
  return EMAIL_RE.test(normalizeEmail(value));
}

/** Lowercased domain of an email ("" when there is none). */
export function emailDomain(value: string | null | undefined): string {
  const email = normalizeEmail(value);
  const at = email.lastIndexOf("@");
  return at < 0 ? "" : email.slice(at + 1);
}

/** Trimmed + lowercased domain, tolerating a leading "@" ("@Foo.com" → "foo.com"). */
export function normalizeDomain(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase().replace(/^@/, "");
}

/** Normalized, valid, deduped and sorted. Invalid entries are dropped. */
export function normalizeEmailList(values: Iterable<string | null | undefined>): string[] {
  const out = new Set<string>();
  for (const v of values) {
    const email = normalizeEmail(v);
    if (EMAIL_RE.test(email)) out.add(email);
  }
  return [...out].sort();
}
