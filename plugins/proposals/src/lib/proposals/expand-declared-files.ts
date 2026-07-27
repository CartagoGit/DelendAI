/**
 * Shared `Files:` line parser (x00158 S1).
 *
 * Two independent parsers used to read the same `- **Files**: ...`
 * proposal syntax: `proposal-completeness.ts` (correct, brace-aware)
 * and `proposal-slice-plan.ts` (a naive `split(',')` that shattered any
 * `{a,b,c}` brace expansion into garbage fragments). This module is the
 * single source of truth both callers now import from.
 */

/** Matches one backtick-delimited path/glob token in a `Files:` line. */
export const BACKTICKED = /`([^`]+)`/g;

/** Captures `prefix{choice,choice,...}suffix` — brace depth is 1. */
export const BRACE_PATTERN = /^(.*)\{([^}]+)\}(.*)$/;

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
					out.push(`${prefix}${choice}${suffix}`);
				}
				continue;
			}
			out.push(trimmed);
		}
	}
	return out;
};
