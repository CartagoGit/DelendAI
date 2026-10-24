/**
 * dry-run/protocol.ts — f00189 (Track F / security).
 *
 * The transversal `dryRun` protocol for tools whose `effects`
 * include anything beyond `[]`. A tool that declares
 * `effects: ['write']` (or `['spawn']`, `['network']`,
 * `['destructive']`) MUST:
 *
 *   - expose `dryRunSupported: true` in its registration
 *     (the manifest loader escalates the inverse to a warning so
 *     a write tool that forgot the flag is loud),
 *   - accept `args.dryRun: true` (the router forwards it),
 *   - return `IDryRunResult` (with `dryRun: true`, `wouldChange`,
 *     `wouldRun`, `risk`) when `dryRun === true`, and never
 *     execute a side effect in that branch.
 *
 * This file owns the types and the pure helpers. The router-side
 * enforcement lives in `enforce.ts`.
 *
 * Design notes (SRP + ISP):
 *   - `DryRunOrRun<R>` is a discriminated union that keeps the
 *     normal return type intact; callers narrow with `dryRun` (the
 *     `dryRun: true` literal is the discriminator).
 *   - All helpers are pure — no I/O, no clock — so the lint can
 *     run them against any plugin manifest without booting the
 *     router.
 */

import type { IToolEffect } from '../contracts/interfaces/tool-registration.interface';

/**
 * A single change the handler WOULD have applied when `dryRun` is
 * unset. The shape is intentionally tool-agnostic; plugins are
 * free to extend it via metadata fields (`meta?: Record<...>`)
 * without breaking the protocol.
 */
export interface IPlannedChange {
	/** What kind of mutation this is. Plugins pick from a small
	 * controlled vocabulary so the matrix generator can group by
	 * kind later. */
	readonly kind: 'write' | 'delete' | 'rename' | 'create' | 'patch';
	/** Workspace-relative path (or fully-qualified when the tool
	 * intentionally targets a path outside the workspace). */
	readonly path: string;
	/**
	 * Free-form description for the LLM and the docs surface.
	 * Required so a plan with no `summary` is a lint failure.
	 */
	readonly summary: string;
}

/**
 * A side-effecting command the handler WOULD have executed. The
 * tool is responsible for naming the command so an operator can
 * audit the plan without re-running the handler.
 */
export interface IPlannedRun {
	/** Spawn shape (shell, network, MCP) — keeps the plan grep-able. */
	readonly shape: 'shell' | 'network' | 'process' | 'git' | 'mcp';
	/** Command / URL / git ref / mcp tool id. */
	readonly target: string;
	/** Free-form args summary for the LLM. */
	readonly summary: string;
}

/**
 * Risk classification. `high` should be reserved for actions that
 * are destructive, irreversible, or cross trust boundaries. The
 * router / host UI uses this to gate `dryRun` confirmations.
 */
export type TDryRunRisk = 'low' | 'medium' | 'high';

/**
 * The shape every `dryRun === true` response must conform to.
 * Discriminator is `dryRun: true` so the union below narrows.
 */
export interface IDryRunResult {
	readonly dryRun: true;
	readonly wouldChange: readonly IPlannedChange[];
	readonly wouldRun: readonly IPlannedRun[];
	readonly risk: TDryRunRisk;
	/** Optional rationale that the LLM / docs surface renders. */
	readonly note?: string;
}

/**
 * The discriminated union a tool handler returns when its
 * registration declares `dryRunSupported: true`. Callers narrow
 * with `if ('dryRun' in result && result.dryRun)` — TypeScript
 * keeps the `R` branch fully typed.
 */
export type DryRunOrRun<R> = IDryRunResult | R;

/**
 * Pure type-guard: is `value` an `IDryRunResult`? Useful when the
 * handler returns `unknown` (e.g. when the router does not know
 * the concrete result type) and the lint wants to verify the
 * shape without trusting the handler.
 */
export const isDryRunResult = (value: unknown): value is IDryRunResult => {
	if (value === null || typeof value !== 'object') return false;
	const candidate = value as { dryRun?: unknown };
	return candidate.dryRun === true;
};

/**
 * Validate a single `IDryRunResult`. Returns the list of
 * structural issues — an empty array means the result is well-
 * formed. Pure.
 */
export interface IDryRunResultIssue {
	readonly path: string;
	readonly message: string;
}

export const validateDryRunResult = (
	value: unknown,
): readonly IDryRunResultIssue[] => {
	if (!isDryRunResult(value)) {
		return [
			{
				path: '$',
				message: 'result is not a DryRunResult (dryRun !== true)',
			},
		];
	}
	const issues: IDryRunResultIssue[] = [];
	const allowedKinds = ['write', 'delete', 'rename', 'create', 'patch'];
	const allowedShapes = ['shell', 'network', 'process', 'git', 'mcp'];
	const allowedRisk = ['low', 'medium', 'high'];

	for (const [index, change] of value.wouldChange.entries()) {
		if (typeof change.path !== 'string' || change.path.length === 0) {
			issues.push({
				path: `wouldChange[${index}].path`,
				message: 'must be a non-empty string',
			});
		}
		if (typeof change.summary !== 'string' || change.summary.length === 0) {
			issues.push({
				path: `wouldChange[${index}].summary`,
				message: 'must be a non-empty string',
			});
		}
		if (
			typeof change.kind !== 'string' ||
			!allowedKinds.includes(change.kind)
		) {
			issues.push({
				path: `wouldChange[${index}].kind`,
				message: `must be one of ${allowedKinds.join('|')}`,
			});
		}
	}

	for (const [index, run] of value.wouldRun.entries()) {
		if (typeof run.target !== 'string' || run.target.length === 0) {
			issues.push({
				path: `wouldRun[${index}].target`,
				message: 'must be a non-empty string',
			});
		}
		if (typeof run.summary !== 'string' || run.summary.length === 0) {
			issues.push({
				path: `wouldRun[${index}].summary`,
				message: 'must be a non-empty string',
			});
		}
		if (
			typeof run.shape !== 'string' ||
			!allowedShapes.includes(run.shape)
		) {
			issues.push({
				path: `wouldRun[${index}].shape`,
				message: `must be one of ${allowedShapes.join('|')}`,
			});
		}
	}

	if (!allowedRisk.includes(value.risk)) {
		issues.push({
			path: 'risk',
			message: `must be one of ${allowedRisk.join('|')}`,
		});
	}

	if (value.note !== undefined && typeof value.note !== 'string') {
		issues.push({
			path: 'note',
			message: 'must be a string when present',
		});
	}

	return issues;
};

/**
 * Build the canonical `IDryRunResult` from raw inputs. Pure; the
 * router uses it to forward plans to the LLM without leaking the
 * handler's internal representation.
 */
export interface IBuildDryRunResultInput {
	readonly wouldChange?: readonly IPlannedChange[];
	readonly wouldRun?: readonly IPlannedRun[];
	readonly risk: TDryRunRisk;
	readonly note?: string;
}

export const buildDryRunResult = (
	input: IBuildDryRunResultInput,
): IDryRunResult => {
	const base = {
		dryRun: true as const,
		wouldChange: input.wouldChange ?? [],
		wouldRun: input.wouldRun ?? [],
		risk: input.risk,
		...(input.note !== undefined ? { note: input.note } : {}),
	};
	return base;
};

/**
 * Compute whether a tool registration's `effects` declaration
 * REQUIRES `dryRunSupported: true`. Pure; the manifest loader
 * uses this to emit a boot warning.
 */
export const dryRunRequiredFor = (
	effects: readonly IToolEffect[] | undefined,
): boolean => {
	if (effects === undefined || effects.length === 0) return false;
	// Every effect outside the read-only default demands dryRun.
	for (const effect of effects) {
		if (
			effect !== 'write' &&
			effect !== 'spawn' &&
			effect !== 'network' &&
			effect !== 'destructive'
		) {
			// Defensive: unknown effect → require dryRun so a
			// newer effect (post-this-file) cannot silently
			// bypass the gate.
			return true;
		}
	}
	return true;
};
