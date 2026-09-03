// language-rules: declarative table for "which manifest / file
// signals which programming language?".
//
// SOLID — Open/Closed. The previous `detectLanguage` was a 5-branch
// `if` cascade in `analyze-project.ts`; adding a new language meant
// editing that body. The table form lets you add a language by
// appending one entry.
//
// SOLID — Single Responsibility. This module owns ONE thing: the
// `file evidence → language` mapping. The matcher is pure
// pipeline. The pkg-derived `javascript` case is the one nuance:
// when the project ships a `package.json` (no other indicator) we
// assume JavaScript. We model that as a `kind: 'has-package-json'`
// rule so the matcher stays declarative.
//
// SOLID — Dependency Inversion. Hosts inject their own rule list
// (e.g. a corporate stack that uses an internal `.corp-proj`
// marker file).

import type { IFileReader } from './analyze-project';
import type { IProjectLanguage } from './analyze-project';
import type { IPackageJson } from './analyze-project';

/**
 * The kinds of evidence a language rule can match against. The
 * union is open: future kinds (e.g. a glob pattern) extend it
 * without changing the table consumer.
 */
export type ILanguageEvidence =
	| { readonly kind: 'exists'; readonly path: string }
	| { readonly kind: 'any-exists'; readonly paths: readonly string[] }
	| { readonly kind: 'has-package-json' };

export interface ILanguageRule {
	readonly id: IProjectLanguage;
	readonly priority: number;
	readonly evidence: ILanguageEvidence;
}

/**
 * A language plus the evidence that made its rule match.
 *
 * The old matcher returned as soon as the first rule matched, which made
 * priority a lossy filter for polyglot workspaces.  Keeping the matched
 * evidence here lets callers retain every language while `matchLanguage`
 * remains the backwards-compatible primary-language projection.
 */
export interface ILanguageMatch {
	readonly id: IProjectLanguage;
	readonly score: number;
	readonly evidence: readonly string[];
}

export const DEFAULT_LANGUAGE_RULES: readonly ILanguageRule[] = [
	// TypeScript first — `tsconfig.json` is the strongest signal.
	{
		id: 'typescript',
		priority: 100,
		evidence: {
			kind: 'any-exists',
			paths: ['tsconfig.json', 'tsconfig.base.json'],
		},
	},
	// The `javascript` rule fires when the project ships a
	// `package.json` AND none of the previous rules (tsconfig,
	// pyproject, etc.) matched. We model that as `has-package-json`
	// with priority 60 (lower than Rust/Go/Python manifests).
	{
		id: 'javascript',
		priority: 60,
		evidence: { kind: 'has-package-json' },
	},
	{
		id: 'python',
		priority: 50,
		evidence: {
			kind: 'any-exists',
			paths: ['pyproject.toml', 'requirements.txt', 'setup.py'],
		},
	},
	{
		id: 'go',
		priority: 40,
		evidence: { kind: 'exists', path: 'go.mod' },
	},
	{
		id: 'rust',
		priority: 30,
		evidence: { kind: 'exists', path: 'Cargo.toml' },
	},
];

const matchedEvidence = async (
	reader: IFileReader,
	pkg: IPackageJson | undefined,
	evidence: ILanguageEvidence,
): Promise<readonly string[]> => {
	if (evidence.kind === 'exists') {
		return (await reader.exists(evidence.path)) ? [evidence.path] : [];
	}
	if (evidence.kind === 'any-exists') {
		const found: string[] = [];
		for (const p of evidence.paths) {
			if (await reader.exists(p)) found.push(p);
		}
		return found;
	}
	// `has-package-json` — fired when the reader could parse a
	// package.json (the analyser passes `pkg` only when parse OK).
	return pkg === undefined ? [] : ['package.json'];
};

const isFallbackJavaScript = (id: IProjectLanguage): boolean =>
	id === 'javascript';

/**
 * Match every language rule and rank the resulting languages by accumulated
 * rule score.  JavaScript is a package.json fallback: when a stronger
 * language manifest is present it is not allowed to mask that language.
 */
export const matchLanguageSignals = async (
	reader: IFileReader,
	pkg?: IPackageJson | undefined,
	rules: readonly ILanguageRule[] = DEFAULT_LANGUAGE_RULES,
): Promise<readonly ILanguageMatch[]> => {
	const grouped = new Map<
		IProjectLanguage,
		{ score: number; evidence: string[] }
	>();
	for (const rule of rules) {
		const evidence = await matchedEvidence(reader, pkg, rule.evidence);
		if (evidence.length === 0) continue;
		const current = grouped.get(rule.id) ?? { score: 0, evidence: [] };
		current.score += rule.priority;
		current.evidence.push(...evidence);
		grouped.set(rule.id, current);
	}

	const hasNonFallbackLanguage = [...grouped.keys()].some(
		(id) => !isFallbackJavaScript(id),
	);
	if (hasNonFallbackLanguage) grouped.delete('javascript');

	return [...grouped.entries()]
		.map(([id, match]) => ({
			id,
			score: match.score,
			evidence: [...new Set(match.evidence)],
		}))
		.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
};

/** Return all matching language ids, ordered by their accumulated score. */
export const matchLanguages = async (
	reader: IFileReader,
	pkg?: IPackageJson | undefined,
	rules: readonly ILanguageRule[] = DEFAULT_LANGUAGE_RULES,
): Promise<readonly IProjectLanguage[]> =>
	(await matchLanguageSignals(reader, pkg, rules)).map(({ id }) => id);

export const matchLanguage = async (
	reader: IFileReader,
	pkg?: IPackageJson | undefined,
	rules: readonly ILanguageRule[] = DEFAULT_LANGUAGE_RULES,
): Promise<IProjectLanguage> => {
	return (await matchLanguageSignals(reader, pkg, rules))[0]?.id ?? 'unknown';
};
