/**
 * Shared `Files:` line parser (x00158 S1).
 *
 * Two independent parsers used to read the same `- **Files**: ...`
 * proposal syntax: `proposal-completeness.ts` (correct, brace-aware)
 * and `proposal-slice-plan.ts` (a naive `split(',')` that shattered any
 * `{a,b,c}` brace expansion into garbage fragments). This module is the
 * single source of truth both callers now import from.
 */

/**
 * A trailing file extension. The bound is generous enough for the long
 * ones this repository actually uses (`.generated.json` is matched by
 * its last segment) and short enough that a sentence ending in a word
 * does not read as a filename.
 */
const MAX_EXTENSION_LENGTH = 12;
const FILE_EXTENSION = new RegExp(
	`\\.[A-Za-z0-9]{1,${MAX_EXTENSION_LENGTH}}$`,
	'u',
);

/** Matches one backtick-delimited path/glob token in a `Files:` line. */
export const BACKTICKED = /`([^`]+)`/g;

/** Captures `prefix{choice,choice,...}suffix` — brace depth is 1. */
export const BRACE_PATTERN = /^(.*)\{([^}]+)\}(.*)$/;

/**
 * A backticked span that is a PATH, and not the prose around it.
 *
 * A `Files:` line is written by a person, and people annotate:
 *
 *     - **Files**: `packages/cli/package.json` (NEW; `private: true`;
 *       `bin: { "delendai": "./dist/index.js" }`) …
 *
 * Every one of those spans is backticked, so taking all of them made
 * `private: true` a claimed path. The checkpoint then refused the whole
 * scope — measured on a live server: every automatic slice checkpoint in
 * a session failed with `unclaimable paths`, naming prose, and no work
 * ref moved at all (x00562).
 *
 * The test is deliberately shape-based rather than filesystem-based: the
 * parser is pure, and a path that does not exist yet is exactly what a
 * proposal declares.
 */
export const looksLikePath = (token: string): boolean => {
	if (token.length === 0 || token.length > 200) return false;
	// Prose gives itself away: spaces, quotes, brackets, a colon that is
	// not a drive letter, or a sentence's punctuation.
	if (/[\s"'()<>;]/u.test(token)) return false;
	if (/[:]/u.test(token)) return false;
	if (token.startsWith('-') || token.startsWith('#')) return false;
	// A path either has a directory separator or a file extension.
	return token.includes('/') || FILE_EXTENSION.test(token);
};

/**
 * Expand every comma-separated path inside backticks, handling
 * `{a,b,c}` brace patterns. Returns the flat list of concrete paths
 * a slice declares in its `Files:` line. Brace depth is 1 (matches
 * the patterns actually used in 2026-Q3 proposals).
 */
export const expandDeclaredFiles = (text: string): ReadonlyArray<string> => {
	const out: string[] = [];
	for (const match of text.matchAll(BACKTICKED)) {
		const inside = match[1] ?? '';
		// Split on commas not inside braces.
		const parts = inside.split(/,\s*(?![^{}]*\})/);
		for (const raw of parts) {
			const trimmed = raw.trim();
			if (trimmed === '') continue;
			const brace = BRACE_PATTERN.exec(trimmed);
			if (brace) {
				const prefix = brace[1] ?? '';
				const choices = brace[2] ?? '';
				const suffix = brace[3] ?? '';
				for (const choice of choices.split(',')) {
					const expanded = `${prefix}${choice}${suffix}`;
					if (looksLikePath(expanded)) out.push(expanded);
				}
				continue;
			}
			if (looksLikePath(trimmed)) out.push(trimmed);
		}
	}
	return out;
};
