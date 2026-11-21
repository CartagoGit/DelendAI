// monorepo-rules: declarative table for "which file / manifest
// field signals which monorepo tool?".
//
// SOLID — Open/Closed. The previous `detectMonorepoTool` was a
// 5-branch `if` cascade in `analyze-project.ts`; adding a monorepo
// tool meant editing that body. The table form lets you add a
// tool by appending one entry.
//
// SOLID — Single Responsibility. This module owns ONE thing: the
// `evidence → monorepo tool` mapping. The matcher is pure
// pipeline. The last rule (bun/npm-workspaces via the
// `package.json` `workspaces` field) is the one nuance: it needs
// the parsed manifest, not the reader. We model that as a
// `has-workspaces` evidence kind so the matcher stays declarative.

import type { IFileReader } from './analyze-project';
import type { IPackageJson } from './analyze-project';

export type IMonorepoEvidence =
	| { readonly kind: 'exists'; readonly path: string }
	| { readonly kind: 'has-workspaces' };

export interface IMonorepoRule {
	readonly id: string;
	readonly priority: number;
	readonly evidence: IMonorepoEvidence;
}

export const DEFAULT_MONOREPO_RULES: readonly IMonorepoRule[] = [
	{
		id: 'nx',
		priority: 100,
		evidence: { kind: 'exists', path: 'nx.json' },
	},
	{
		id: 'turbo',
		priority: 90,
		evidence: { kind: 'exists', path: 'turbo.json' },
	},
	{
		id: 'pnpm-workspaces',
		priority: 80,
		evidence: { kind: 'exists', path: 'pnpm-workspace.yaml' },
	},
	{
		id: 'lerna',
		priority: 70,
		evidence: { kind: 'exists', path: 'lerna.json' },
	},
	{
		id: 'bun/npm-workspaces',
		priority: 60,
		evidence: { kind: 'has-workspaces' },
	},
];

const matches = async (
	reader: IFileReader,
	pkg: IPackageJson | undefined,
	evidence: IMonorepoEvidence,
): Promise<boolean> => {
	if (evidence.kind === 'exists') return await reader.exists(evidence.path);
	// `has-workspaces` — true when the package.json declares
	// `workspaces` (the bun/npm convention). Note we treat the
	// `workspaces` field as a tuple of strings OR an object
	// (npm's "named workspaces"); the analyser passes the
	// package.json in only when JSON.parse succeeded.
	return pkg?.workspaces !== undefined;
};

export const matchMonorepoTool = async (
	reader: IFileReader,
	pkg?: IPackageJson | undefined,
	rules: readonly IMonorepoRule[] = DEFAULT_MONOREPO_RULES,
): Promise<string | undefined> => {
	const sorted = [...rules].sort((a, b) => b.priority - a.priority);
	for (const rule of sorted) {
		if (await matches(reader, pkg, rule.evidence)) return rule.id;
	}
	return undefined;
};
