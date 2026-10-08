// lib/format/person.ts

/**
 * Person labels for filters and dropdowns (Business Lead, Digital Lead…):
 * show a name, never a raw email. Pure — the email → name map comes from
 * useUsersMap.
 */

import { emailDomain, isValidEmail, nameFromEmail, normalizeEmail } from "./email";

/**
 * A person reference as a name: the user's display name from `names`, else a
 * name built from the email ("aicha.dhaheri@x.com" → "Aicha Dhaheri"). A
 * value that isn't an email (already a name, a legacy uid) is returned as is,
 * unless `names` knows it.
 */
export function personLabel(value: string, names?: ReadonlyMap<string, string>): string {
  const raw = (value ?? "").trim();
  const known = names?.get(raw) ?? names?.get(normalizeEmail(raw));
  if (known && !isValidEmail(known)) return known;
  return isValidEmail(raw) ? nameFromEmail(raw) : known ?? raw;
}

/** Same person, whatever the spacing, accents or punctuation. */
function nameKey(label: string): string {
  return label.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z]/g, "");
}

/**
 * When two option values (two accounts of one person) end up with the same
 * name, adds the email domain to each: "Derek Laurendeau (jungle-media.ca)".
 * Order is kept.
 */
export function disambiguatePersonOptions<T extends { value: string; label: string }>(options: T[]): T[] {
  const counts = new Map<string, number>();
  for (const o of options) counts.set(nameKey(o.label), (counts.get(nameKey(o.label)) ?? 0) + 1);
  return options.map((o) =>
    counts.get(nameKey(o.label))! > 1 && isValidEmail(o.value)
      ? { ...o, label: `${o.label} (${emailDomain(o.value)})` }
      : o
  );
}
