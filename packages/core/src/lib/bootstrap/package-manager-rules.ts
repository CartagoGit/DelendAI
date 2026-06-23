// package-manager-rules: declarative table for "which lockfile
// signals which package manager?".
//
// SOLID — Open/Closed. The previous `detectPackageManager` was a
// 4-branch `if` cascade in `analyze-project.ts`; adding a manager
// meant editing that body. The table form lets you add a manager
// by appending one entry.
//
// SOLID — Single Responsibility. This module owns ONE thing: the
// `lockfile → manager` mapping. The matcher is pure pipeline.
// `bun` has two lockfile names (`bun.lock` + `bun.lockb`); the
// `any-exists` evidence kind models that natively.

import type { IFileReader } from './analyze-project';
import type { IProjectAnalysis } from './analyze-project';

export type IPackageManagerEvidence =
	| { readonly kind: 'exists'; readonly path: string }
	| { readonly kind: 'any-exists'; readonly paths: readonly string[] };

export interface IPackageManagerRule {
	/** The manager id (matches `IProjectAnalysis.packageManager`). */
	readonly id: IProjectAnalysis['packageManager'];
	readonly priority: number;
	readonly evidence: IPackageManagerEvidence;
}

export const DEFAULT_PACKAGE_MANAGER_RULES: readonly IPackageManagerRule[] = [
	{
		id: 'bun',
		priority: 100,
		evidence: {
			kind: 'any-exists',
			paths: ['bun.lock', 'bun.lockb'],
		},
	},
	{
		id: 'pnpm',
		priority: 90,
		evidence: { kind: 'exists', path: 'pnpm-lock.yaml' },
	},
	{
		id: 'yarn',
		priority: 80,
		evidence: { kind: 'exists', path: 'yarn.lock' },
	},
	{
		id: 'npm',
		priority: 70,
		evidence: { kind: 'exists', path: 'package-lock.json' },
	},
];

const matches = (
	reader: IFileReader,
	evidence: IPackageManagerEvidence,
): boolean => {
	if (evidence.kind === 'exists') return reader.exists(evidence.path);
	return evidence.paths.some((p) => reader.exists(p));
};

export const matchPackageManager = (
	reader: IFileReader,
	rules: readonly IPackageManagerRule[] = DEFAULT_PACKAGE_MANAGER_RULES,
): IProjectAnalysis['packageManager'] => {
	const sorted = [...rules].sort((a, b) => b.priority - a.priority);
	for (const rule of sorted) {
		if (matches(reader, rule.evidence)) return rule.id;
	}
	return 'unknown';
};
