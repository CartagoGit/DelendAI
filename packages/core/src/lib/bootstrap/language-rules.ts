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

const matches = (
	reader: IFileReader,
	pkg: IPackageJson | undefined,
	evidence: ILanguageEvidence,
): boolean => {
	if (evidence.kind === 'exists') return reader.exists(evidence.path);
	if (evidence.kind === 'any-exists') {
		return evidence.paths.some((p) => reader.exists(p));
	}
	// `has-package-json` — fired when the reader could parse a
	// package.json (the analyser passes `pkg` only when parse OK).
	return pkg !== undefined;
};

export const matchLanguage = (
	reader: IFileReader,
	pkg?: IPackageJson | undefined,
	rules: readonly ILanguageRule[] = DEFAULT_LANGUAGE_RULES,
): IProjectLanguage => {
	const sorted = [...rules].sort((a, b) => b.priority - a.priority);
	for (const rule of sorted) {
		if (matches(reader, pkg, rule.evidence)) return rule.id;
	}
	return 'unknown';
};
