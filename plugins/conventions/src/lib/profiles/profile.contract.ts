/**
 * profile.contract.ts — the language-profile port (f00113 S1, promoted
 * from f00050 S-D).
 *
 * A profile is pure data: which file extensions it classifies and an
 * ordered rule table (first match wins). Role names are OPEN strings
 * scoped to the profile — deliberately NOT the core's closed `Role`
 * union, because `__init__.py`/`mod.rs`/`go.mod` vocabulary must never
 * leak into `packages/core` (AGENTS.md rule #1). The TypeScript profile
 * wraps the core's canonical `DEFAULT_TS_RULES` unchanged, so this
 * module adds languages without forking the existing contract.
 */

export interface ILanguageRoleRule {
	/** Profile-scoped role name (e.g. `module`, `package-marker`). */
	readonly name: string;
	/** Pure predicate over a repo-relative POSIX path. */
	match(rel: string): boolean;
}

export interface ILanguageProfile {
	/** Stable id the tools accept (`typescript`, `python`, `rust`, `go`). */
	readonly id: string;
	readonly displayName: string;
	/** Extensions this profile classifies (lowercase, with dot). */
	readonly fileExtensions: readonly string[];
	/** Ordered rule table — first match wins. */
	readonly rules: readonly ILanguageRoleRule[];
	/** Extra directories to skip when scanning (on top of the shared set). */
	readonly skipDirs?: readonly string[];
}

/** Classify one path against a profile. `'other'` = drift. */
export const classifyWithProfile = (
	profile: ILanguageProfile,
	rel: string,
): string => {
	for (const rule of profile.rules) {
		if (rule.match(rel)) return rule.name;
	}
	return 'other';
};

/** True when `rel`'s extension belongs to the profile. */
export const matchesProfileExtension = (
	profile: ILanguageProfile,
	rel: string,
): boolean =>
	profile.fileExtensions.some((ext) => rel.toLowerCase().endsWith(ext));

/** Shared helper: does the path contain `/segment/` (or start with it)? */
export const hasPathSegment = (rel: string, segment: string): boolean =>
	rel === segment ||
	rel.startsWith(`${segment}/`) ||
	rel.includes(`/${segment}/`);

/** Shared helper: the path's basename. */
export const basenameOf = (rel: string): string =>
	rel.slice(rel.lastIndexOf('/') + 1);
