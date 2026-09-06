/**
 * string-helpers.ts
 *
 * Pure string transformations used by the proposal tooling. Extracted
 * from `authoring.tool.ts` (which had inline copies) and from
 * `mutate-tools.ts` (which had its own `escapeRegExp` under a
 * different name) — same shape, two callers, three definitions.
 *
 * SRP: this module owns ONLY the question "how do I safely turn a
 * user-supplied string into a filesystem-safe / regex-safe / kebab
 * identifier?". No file I/O, no domain knowledge, no proposal
 * semantics — those callers add the context.
 *
 * Pure functions only. Trivial implementations, but a single source
 * of truth for the project's "kebab" and "regex-escape" rules.
 */

/**
 * Escape regex metacharacters so a user-supplied string (slice id,
 * proposal id, ...) can't alter the regex it is interpolated into.
 * The character class is the canonical one from the MDN docs —
 * covers `. * + ? ^ $ { } ( ) | [ ] \`.
 */
export const escapeRegExp = (value: string): string =>
	value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Project-agnostic kebab-case: lowercase, replace any run of
 * non-alphanumerics with `-`, trim leading/trailing dashes.
 *
 *   kebab('  My Cool Slice!  ')  // → 'my-cool-slice'
 *   kebab('foo/bar baz')          // → 'foo-bar-baz'
 *   kebab('---already---kebab')   // → 'already-kebab'
 *
 * Used by `create_proposal` to derive filenames from human titles,
 * and by `proposal_id_allocator` to normalise user-supplied seeds.
 */
export const kebab = (value: string): string =>
	value
		.trim()
		.normalize('NFD')
		.replace(/\p{M}/gu, '')
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '');

/**
 * Latin-1 diacritics are stripped via NFD (a00085 #10: `Audit` →
 * `audit`). Scripts without a Latin base (Chinese, Cyrillic, …)
 * still collapse to `''`; `slugFromTitle` then falls back to the id.
 *
 *   slugFromTitle('My Cool Slice', 'f00042')  // → 'my-cool-slice'
 *   slugFromTitle('提案', 'f00042')            // → 'f00042' (kebab⇒'')
 */
export const slugFromTitle = (title: string, fallback: string): string => {
	const slug = kebab(title);
	return slug.length > 0 ? slug : fallback;
};
