/**
 * dry-run/enforce.ts — f00189 (Track F / security).
 *
 * Router-side enforcement for the `dryRun` transversal:
 *
 *   1. `validateToolDryRunManifest(effects, dryRunSupported)` —
 *      emits a `warning` when a tool declares non-empty effects
 *      but does NOT declare `dryRunSupported: true`. The router
 *      surfaces this at boot so a missing flag is loud, not
 *      silent.
 *   2. `enforceDryRunReturnContract(args, result)` — when
 *      `args.dryRun === true` and the handler did NOT return a
 *      valid `IDryRunResult`, the router returns a typed refusal
 *      instead of forwarding whatever the handler produced. This
 *      is the runtime safety net for "a plugin forgot to honour
 *      dryRun".
 *
 * Both helpers are pure; the router wires them into its call path
 * without growing state.
 */

import type { IToolEffect } from '../contracts/interfaces/tool-registration.interface';
import {
	buildDryRunResult,
	type IDryRunResult,
	type IPlannedChange,
	type IPlannedRun,
	isDryRunResult,
	type TDryRunRisk,
	validateDryRunResult,
} from './protocol';

export interface IDryRunManifestWarning {
	readonly kind: 'manifest-warning';
	readonly tool: string;
	readonly message: string;
}

/**
 * Build the boot-time warning when a tool's `effects` declaration
 * requires `dryRunSupported: true` but the registration omits it.
 * Pure.
 */
export const validateToolDryRunManifest = (input: {
	readonly tool: string;
	readonly effects: readonly IToolEffect[] | undefined;
	readonly dryRunSupported: boolean | undefined;
}): IDryRunManifestWarning | null => {
	const { tool, effects, dryRunSupported } = input;
	if (dryRunSupported === true) return null;
	const effectsList = effects ?? [];
	if (effectsList.length === 0) return null;
	return {
		kind: 'manifest-warning',
		tool,
		message: `tool "${tool}" declares effects [${effectsList.join(', ')}] but does not declare dryRunSupported: true — agents cannot preview the change.`,
	};
};

/**
 * Compute the canonical "what would this tool do?" plan when the
 * caller asks for a dryRun. Plugins use this helper to format
 * their own plan without re-implementing the schema; the router
 * validates the output with `validateDryRunResult` and forwards
 * it when it is well-formed.
 */
export const planDryRun = (input: {
	readonly wouldChange?: readonly IPlannedChange[];
	readonly wouldRun?: readonly IPlannedRun[];
	readonly risk: TDryRunRisk;
	readonly note?: string;
}): IDryRunResult => buildDryRunResult(input);

export interface IDryRunContractRefusal {
	readonly kind: 'dry-run-contract-violation';
	readonly reason: string;
	readonly issues: readonly { path: string; message: string }[];
}

/**
 * The router-facing gate: given the caller-supplied `args` and the
 * handler's result, return either the result (when valid) or a
 * typed refusal the host can surface.
 *
 * Rules:
 *   - When `args.dryRun !== true`, the helper forwards the
 *     result untouched (the plugin ran for real).
 *   - When `args.dryRun === true`, the result MUST be an
 *     `IDryRunResult`. Anything else → typed refusal.
 */
export const enforceDryRunReturnContract = (input: {
	readonly args: { readonly dryRun?: unknown };
	readonly result: unknown;
}):
	| { readonly kind: 'forwarded'; readonly value: unknown }
	| IDryRunContractRefusal => {
	const { args, result } = input;
	if (args.dryRun !== true) return { kind: 'forwarded', value: result };
	if (isDryRunResult(result)) {
		const issues = validateDryRunResult(result);
		if (issues.length === 0) return { kind: 'forwarded', value: result };
		return {
			kind: 'dry-run-contract-violation',
			reason: 'handler returned a malformed DryRunResult',
			issues,
		};
	}
	return {
		kind: 'dry-run-contract-violation',
		reason: 'handler ignored args.dryRun and returned a non-dryRun payload',
		issues: [
			{
				path: '$',
				message:
					'expected { dryRun: true, wouldChange, wouldRun, risk }',
			},
		],
	};
};
