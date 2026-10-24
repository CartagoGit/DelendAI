// stack-drift-detector: "did the project's stack change?".
//
// SOLID — Single Responsibility. This file owns the diff for the
// six "stack fingerprint" fields of `IProjectAnalysis`:
// framework, language, monorepo tool, package manager, test runner,
// MCP-server presence.
//
// SOLID — Open/Closed. Adding a new stack field (e.g. `runtime`)
// is one line in the `FIELDS` table below. The composer doesn't
// change.

import type { IDriftChange } from './drift';
import type { IDriftDetector } from './drift-detector';
import type { IProjectAnalysis } from './analyze-project';

type IDriftKind =
	| 'framework-changed'
	| 'language-changed'
	| 'monorepo-changed'
	| 'package-manager-changed'
	| 'test-runner-changed'
	| 'mcp-server-added'
	| 'mcp-server-dropped';

interface IStackField<T> {
	readonly key: keyof IProjectAnalysis;
	readonly read: (a: IProjectAnalysis) => T;
	readonly format: (before: T, after: T) => string;
	readonly classify: (before: T, after: T) => IDriftKind | undefined;
}

/**
 * The stack fingerprint, declared as data so new fields are a one-liner
 * addition. Each field contributes its own diff rule and human-readable
 * format.
 */
const STACK_FIELDS: readonly IStackField<unknown>[] = [
	{
		key: 'framework',
		read: (a) => a.framework,
		format: (before, after) =>
			`framework: ${before ?? '(none)'} → ${after ?? '(none)'}`,
		classify: (before, after) =>
			before === after ? undefined : 'framework-changed',
	},
	{
		key: 'language',
		read: (a) => a.language,
		format: (before, after) =>
			`language: ${String(before)} → ${String(after)}`,
		classify: (before, after) =>
			before === after ? undefined : 'language-changed',
	},
	{
		key: 'monorepoTool',
		read: (a) => a.monorepoTool,
		format: (before, after) =>
			`monorepo tool: ${before ?? '(none)'} → ${after ?? '(none)'}`,
		classify: (before, after) =>
			before === after ? undefined : 'monorepo-changed',
	},
	{
		key: 'packageManager',
		read: (a) => a.packageManager,
		format: (before, after) =>
			`package manager: ${String(before)} → ${String(after)}`,
		classify: (before, after) =>
			before === after ? undefined : 'package-manager-changed',
	},
	{
		key: 'testRunner',
		read: (a) => a.testRunner,
		format: (before, after) =>
			`test runner: ${String(before)} → ${String(after)}`,
		classify: (before, after) =>
			before === after ? undefined : 'test-runner-changed',
	},
	{
		key: 'hasMcpProject',
		read: (a) => a.hasMcpProject,
		format: (_before, after) =>
			after
				? 'An MCP server appeared; consider `diff_capabilities` before scaffolding'
				: 'MCP server was removed; this server is now the only one in the project',
		classify: (before, after): IDriftKind | undefined =>
			before === after
				? undefined
				: after
					? 'mcp-server-added'
					: 'mcp-server-dropped',
	},
];

export class StackDriftDetector implements IDriftDetector {
	readonly id = 'stack';

	detect({
		current,
		last,
	}: {
		current: IProjectAnalysis;
		last: IProjectAnalysis;
	}): readonly IDriftChange[] {
		const out: IDriftChange[] = [];
		for (const field of STACK_FIELDS) {
			const before = field.read(last);
			const after = field.read(current);
			const kind = field.classify(before, after);
			if (kind === undefined) continue;
			out.push({ kind, summary: field.format(before, after) });
		}
		return out;
	}
}
