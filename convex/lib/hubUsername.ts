/**
 * Canonical hub-username rules, shared by every code path that derives,
 * stores or looks up a representative username.
 *
 * A username is the hub name lowercased, with accents folded ("É" -> "e")
 * and every run of non-alphanumeric characters (spaces, dashes of any kind,
 * punctuation, apostrophes…) collapsed to a single underscore. Examples:
 *
 *   "Ashanti Mampong"      -> "ashanti_mampong"
 *   "Gabon – Libreville"   -> "gabon_libreville"   (en dash dropped)
 *   "N'Djamena Hub"        -> "n_djamena_hub"
 *
 * Signing in accepts the same string with underscores, hyphens or spaces —
 * and even with leftover punctuation — because every candidate is compared
 * through the same canonical form.
 */

/** Canonical form used for comparisons and throttle keys. */
export function canonicalUsername(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
}

/** Stored username for a hub name (single source of truth for admins). */
export function deriveUsername(hubName: string): string {
  return canonicalUsername(hubName);
}

/**
 * Candidate usernames to try for a sign-in / forgot-password lookup:
 * the typed form, then all separator rewrites (space/hyphen/underscore),
 * then the canonical form which always matches the stored username.
 */
export function usernameCandidates(raw: string): string[] {
  const base = raw.trim().toLowerCase();
  if (!base) return [];
  return [
    ...new Set([
      base,
      base.replace(/[\s-]+/g, "_"),
      base.replace(/[\s_]+/g, "-"),
      base.replace(/[\s_-]+/g, " "),
      canonicalUsername(base),
    ]),
  ];
}
