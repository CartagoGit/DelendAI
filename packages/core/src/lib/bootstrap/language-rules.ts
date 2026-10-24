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

/**
 * `priority` is the STRENGTH of the evidence, not its position in a
 * cascade.
 *
 * These numbers were written for a first-match matcher, where they only
 * had to order the checks: TypeScript before JavaScript before Python,
 * so 100 / 60 / 50 / 40 / 30. Under cumulative scoring the same numbers
 * became claims about how much each signal is worth, and one of them was
 * badly wrong: a bare `package.json` scored 60 and outranked a
 * `pyproject.toml` at 50. That is the exact misclassification q00017
 * names — a FastAPI backend with a small npm frontend reported as
 * `javascript`, "porque 60 > 50".
 *
 * So a dedicated manifest, which exists to declare one language and
 * nothing else, scores high; a generic `package.json`, which every Node
 * repository has whatever it is written in, scores low. Ordering in this
 * array no longer carries meaning.
 */
export const DEFAULT_LANGUAGE_RULES: readonly ILanguageRule[] = [
	{
		id: 'typescript',
		priority: 100,
		evidence: {
			kind: 'any-exists',
			paths: ['tsconfig.json', 'tsconfig.base.json'],
		},
	},
	{
		id: 'python',
		priority: 90,
		evidence: {
			kind: 'any-exists',
			paths: ['pyproject.toml', 'requirements.txt', 'setup.py'],
		},
	},
	{
		id: 'go',
		priority: 90,
		evidence: { kind: 'exists', path: 'go.mod' },
	},
	{
		id: 'rust',
		priority: 90,
		evidence: { kind: 'exists', path: 'Cargo.toml' },
	},
	// The weakest language evidence there is: every Node repository ships
	// one, including TypeScript repositories and repositories that carry
	// a package.json only for a build script.
	{
		id: 'javascript',
		priority: 20,
		evidence: { kind: 'has-package-json' },
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

/**
 * Match every language rule and rank the resulting languages by accumulated
 * rule score.
 *
 * The one suppression left is TypeScript over JavaScript, and only that
 * pair. They are the same ecosystem reading the same evidence: a
 * TypeScript project has a `package.json` too, so reporting `javascript`
 * beside it adds a second name for one fact.
 *
 * Rust, Go and Python deliberately do NOT suppress it. An earlier version
 * dropped `javascript` whenever ANY other language was found, which is
 * the scalar thinking this whole plan exists to remove: a React frontend
 * beside a FastAPI backend really is both, and answering "python" alone
 * is the mirror image of the bug where a small npm frontend hid the
 * Python backend.
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

	if (grouped.has('typescript')) grouped.delete('javascript');

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
