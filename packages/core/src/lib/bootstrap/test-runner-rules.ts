// test-runner-rules: declarative table for "which test runner is
// the project using?".
//
// SOLID — Open/Closed. The previous `detectTestRunner` was a
// 6-branch `if`+`regex` cascade in `analyze-project.ts`; adding
// a new runner (e.g. `vitest-browser`, `uv`, `pnpm test`) meant
// editing that body. The table form lets you add a runner by
// appending one entry.
//
// SOLID — Single Responsibility. This module owns ONE thing: the
// `evidence → test runner` mapping. The matcher is pure
// pipeline. Two evidence kinds are supported:
//
//   - `has-dep`     — the runner's npm package is in `dependencies`
//                      or `devDependencies`.
//   - `script-regex` — the project's `scripts.test` matches a
//                      regular expression (regex pattern).
//
// `has-dep` rules outrank `script-regex` rules because the
// presence of a dep is a stronger signal than a script that
// happens to mention the runner's name.
//
// SOLID — Dependency Inversion. Hosts inject their own rule list
// (e.g. a corporate stack that uses a private runner).

import type { IProjectAnalysis } from './analyze-project';

export type ITestRunnerEvidence =
	| { readonly kind: 'has-dep'; readonly depName: string }
	| { readonly kind: 'script-regex'; readonly pattern: string };

export interface ITestRunnerRule {
	/** The runner id (matches `IProjectAnalysis.testRunner`). */
	readonly id: IProjectAnalysis['testRunner'];
	readonly priority: number;
	readonly evidence: ITestRunnerEvidence;
}

export const DEFAULT_TEST_RUNNER_RULES: readonly ITestRunnerRule[] = [
	// `has-dep` rules — strongest signal. Priorities 100+.
	{
		id: 'vitest',
		priority: 100,
		evidence: { kind: 'has-dep', depName: 'vitest' },
	},
	{
		id: 'jest',
		priority: 90,
		evidence: { kind: 'has-dep', depName: 'jest' },
	},
	// `script-regex` rules — fall back when no dep is present.
	// Priorities < 90 so they never outrank a matching `has-dep`.
	{
		id: 'vitest',
		priority: 80,
		evidence: { kind: 'script-regex', pattern: '\\bvitest\\b' },
	},
	{
		id: 'jest',
		priority: 70,
		evidence: { kind: 'script-regex', pattern: '\\bjest\\b' },
	},
	{
		id: 'bun',
		priority: 60,
		evidence: { kind: 'script-regex', pattern: '\\bbun test\\b' },
	},
	{
		id: 'node',
		priority: 50,
		evidence: { kind: 'script-regex', pattern: '\\bnode --test\\b' },
	},
];

const matches = (
	deps: Readonly<Record<string, string>>,
	testScript: string,
	rule: ITestRunnerRule,
): boolean => {
	if (rule.evidence.kind === 'has-dep') {
		return rule.evidence.depName in deps;
	}
	// script-regex: only test against the project's `test` script.
	// Empty scripts return false fast.
	if (testScript === '') return false;
	// The patterns are stored as raw strings (without the
	// leading/trailing slashes); we wrap them in `new RegExp`
	// for the matcher. Compilation is cached on first call.
	try {
		return new RegExp(rule.evidence.pattern).test(testScript);
	} catch {
		return false;
	}
};

export const matchTestRunner = (
	deps: Readonly<Record<string, string>>,
	scripts: Readonly<Record<string, string>>,
	rules: readonly ITestRunnerRule[] = DEFAULT_TEST_RUNNER_RULES,
): IProjectAnalysis['testRunner'] => {
	const sorted = [...rules].sort((a, b) => b.priority - a.priority);
	const testScript = scripts.test ?? '';
	for (const rule of sorted) {
		if (matches(deps, testScript, rule)) return rule.id;
	}
	return 'unknown';
};
