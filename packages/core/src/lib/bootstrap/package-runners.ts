// package-runners: declarative table for "given a detected package
// manager, what command do I run to invoke a script?".
//
// SOLID — Open/Closed. The previous `runner` function in
// `recommend-plan.ts` was a `switch` with 4 hardcoded cases. Adding
// a new manager (e.g. `pnpm@9` with a different invocation) meant
// editing the function. The table form makes the runner pure data
// and lets hosts inject their own.
//
// SOLID — Single Responsibility. This module owns ONE thing: the
// `packageManager → invocation` mapping. The `buildValidationCommands`
// function in `recommend-plan.ts` consumes the table; it does not
// know which managers are supported.

import type { IProjectAnalysis } from './analyze-project';

/** Detected package managers. The list mirrors `IProjectAnalysis`. */
export type PackageManagerId = IProjectAnalysis['packageManager'];

export interface IPackageRunner {
	readonly id: PackageManagerId;
	/** Default runner string (e.g. `'bun run'`, `'pnpm'`, `'npm run'`). */
	readonly runner: string;
}

/**
 * The default runner table. Each entry is the script-invocation
 * string prepended to the script role when the agent runs
 * `validate_matrix` or `run_<role>` tools. Note: `pnpm` and `yarn`
 * already accept `pnpm <role>` / `yarn <role>` (no `run` infix),
 * while `bun` and `npm` use `<runner> run <role>`.
 */
export const DEFAULT_PACKAGE_RUNNERS: readonly IPackageRunner[] = [
	{ id: 'bun', runner: 'bun run' },
	{ id: 'pnpm', runner: 'pnpm' },
	{ id: 'yarn', runner: 'yarn' },
	{ id: 'npm', runner: 'npm run' },
	{ id: 'unknown', runner: 'npm run' },
];

/**
 * Pure: returns the runner string for the given package manager.
 * Allocates a map once and reuses it across calls; safe to call
 * inside `buildValidationCommands` per script role.
 */
const RUNNER_BY_ID: ReadonlyMap<PackageManagerId, string> = new Map(
	DEFAULT_PACKAGE_RUNNERS.map((r) => [r.id, r.runner]),
);

export const runnerFor = (pm: PackageManagerId): string =>
	RUNNER_BY_ID.get(pm) ?? 'npm run';
