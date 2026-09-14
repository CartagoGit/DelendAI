/**
 * config-transition.interface.ts — the shapes of "the configuration
 * changed; bring the workspace along".
 *
 * The migration engine answers a different question: "is there legacy
 * here that a one-off, id-recorded step should heal?". A configuration
 * change is not one-off. It happens every time somebody edits
 * `delendai.config.json`, so it cannot be recorded by id — it is
 * recorded by the configuration it last brought the workspace to.
 */

import type { IMigrationPlanStep } from './workspace-migration.interface';

/**
 * The parts of the configuration whose change has consequences on disk,
 * as they were last applied to this workspace.
 *
 * Deliberately NOT the raw file: comments, option values and key order
 * change constantly and require nothing. Only effective values that a
 * transition knows how to act on belong here, so an edit that changes
 * none of them is, correctly, not a transition at all.
 */
export interface IAppliedConfigSnapshot {
	readonly version: 1;
	/** Workspace-relative cache root the runtime was using. */
	readonly cacheDir: string;
	/** Workspace-relative docs root the runtime was using. */
	readonly docsDir: string;
	/** Enabled plugin names, sorted. */
	readonly plugins: readonly string[];
}

/** Where a transition runs, and whether it may change anything. */
export interface IConfigTransitionContext {
	readonly workspaceRoot: string;
	readonly dryRun: boolean;
}

/**
 * One consequence of a configuration change.
 *
 * `plan` is pure and returns no steps when this transition has nothing
 * to do for the pair, which is how the reconciler stays silent on the
 * common case. `apply` is only ever called after a non-empty plan.
 */
export interface IConfigTransition {
	readonly id: string;
	readonly plan: (
		previous: IAppliedConfigSnapshot,
		next: IAppliedConfigSnapshot,
	) => readonly IMigrationPlanStep[];
	readonly apply: (
		previous: IAppliedConfigSnapshot,
		next: IAppliedConfigSnapshot,
		ctx: IConfigTransitionContext,
	) => Promise<void>;
}

export type IConfigTransitionOutcome =
	| {
			readonly status: 'planned';
			readonly id: string;
			readonly steps: readonly IMigrationPlanStep[];
	  }
	| {
			readonly status: 'applied';
			readonly id: string;
			readonly steps: readonly IMigrationPlanStep[];
	  }
	| {
			readonly status: 'failed';
			readonly id: string;
			readonly reason: string;
	  };

export interface IConfigTransitionRunResult {
	/**
	 * `recorded` when a snapshot of the last applied configuration
	 * existed; `inferred` when it did not and the previous configuration
	 * was reconstructed from defaults and what is on disk.
	 */
	readonly previousSource: 'recorded' | 'inferred';
	readonly outcomes: readonly IConfigTransitionOutcome[];
	readonly acted: boolean;
	/** Why nothing was attempted, when nothing was. */
	readonly skipped?: string | undefined;
}
