/**
 * search-engine.gitignore.ts — Solid-SRP extraction (gitignore parser).
 *
 * Pulled out of `search-engine.service.ts` so the in-house walker and
 * any future backend that needs `.gitignore` semantics can depend on
 * the parser alone. The contract is two pure functions:
 *
 *   - `parseGitignore(raw)` → `readonly IGitignoreRule[]`
 *   - `isGitignored(relPath, isDir, rules)` → `boolean`
 *
 * Approximates git semantics (good enough for skipping search noise,
 * NOT a git reimplementation): a pattern with an internal `/` anchors
 * to the workspace root; a bare segment matches at any depth; `**`
 * reuses the same span-matching as `globToRegExp`; `!` negates a
 * previous match; trailing `/` restricts the rule to directories.
 */

export interface IGitignoreRule {
	readonly re: RegExp;
	readonly negate: boolean;
	readonly dirOnly: boolean;
}

import { globToRegExp } from './search-engine.glob';

/**
 * Compile one `.gitignore` line into a rule. `undefined` for empty /
 * comment / malformed lines.
 */
export const compileGitignoreLine = (
	rawLine: string,
): IGitignoreRule | undefined => {
	let line = rawLine.trim();
	if (line.length === 0 || line.startsWith('#')) return undefined;
	const negate = line.startsWith('!');
	if (negate) line = line.slice(1);
	const dirOnly = line.endsWith('/');
	if (dirOnly) line = line.slice(0, -1);
	if (line.length === 0) return undefined;
	const anchored = line.startsWith('/');
	if (anchored) line = line.slice(1);
	const body = globToRegExp(line).source.slice(1, -1); // strip globToRegExp's ^…$
	const pattern = anchored || line.includes('/') ? body : `(?:.*/)?${body}`;
	return { re: new RegExp(`^${pattern}(?:/.*)?$`), negate, dirOnly };
};

/** Parse a `.gitignore` file's text into compiled rules, in file order. */
export const parseGitignore = (raw: string): readonly IGitignoreRule[] =>
	raw
		.split('\n')
		.map(compileGitignoreLine)
		.filter((rule): rule is IGitignoreRule => rule !== undefined);

/**
 * Last-matching-rule-wins, as git does. `isDir` lets directory-only (`/`
 * suffixed) rules skip files. Returns false (not ignored) for an empty
 * rule set, so callers never need to special-case "no .gitignore".
 */
export const isGitignored = (
	relPath: string,
	isDir: boolean,
	rules: readonly IGitignoreRule[],
): boolean => {
	let ignored = false;
	for (const rule of rules) {
		if (rule.dirOnly && !isDir) continue;
		if (rule.re.test(relPath)) ignored = !rule.negate;
	}
	return ignored;
};
