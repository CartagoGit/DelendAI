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

/**
 * Strip the leading `<id>` from a proposal title when the title
 * duplicates the id (the consumer convention is `<id>: <human
 * description>` so the markdown body starts with `# <id> — <title>`
 * and the human eye sees the id twice). Without this strip the slug
 * already includes the id, the filename builder prepends the id
 * again, and the on-disk filename becomes `x00050-x00050-...md`
 * (x00050 S2 / sync_proposals filename-builder bug).
 *
 * Accepted title shapes (case-insensitive on the id, optional
 * trailing separator):
 *
 *   stripIdPrefixFromTitle('x00050: CI roja — …', 'x00050')
 *     // → 'CI roja — …'
 *   stripIdPrefixFromTitle('x00050 — CI roja', 'x00050')
 *     // → 'CI roja'
 *   stripIdPrefixFromTitle('x00050 CI roja', 'x00050')
 *     // → 'CI roja'
 *   stripIdPrefixFromTitle('x00051: unrelated', 'x00050')
 *     // → 'x00051: unrelated'  (id mismatch — leave alone)
 *   stripIdPrefixFromTitle('a generic title', 'x00050')
 *     // → 'a generic title'    (no leading id — leave alone)
 *
 * The id is regex-escaped first so a stray metacharacter in the id
 * (impossible today, but cheap insurance against future id shapes
 * that allow punctuation) cannot widen the match.
 */
export const stripIdPrefixFromTitle = (title: string, id: string): string => {
	const trimmedTitle = title.trim();
	if (trimmedTitle.length === 0) return trimmedTitle;
	if (id.length === 0) return trimmedTitle;
	const escapedId = escapeRegExp(id);
	// Match `<id>` followed by zero or more whitespace characters and
	// then OPTIONALLY one separator (`:`, ` — ` em-dash, ` - ` hyphen,
	// ` – ` en-dash) plus optional whitespace. The separator group is
	// deliberately optional so titles without any of those still strip.
	const re = new RegExp(`^${escapedId}\\s*[:\\-–—]?\\s*`, 'iu');
	const stripped = trimmedTitle.replace(re, '').trim();
	// Guard: if stripping produced an empty title (the whole title was
	// just the id + separator), return the original so the caller can
	// fall back to the id-derived slug instead of an empty one.
	return stripped.length > 0 ? stripped : trimmedTitle;
};
