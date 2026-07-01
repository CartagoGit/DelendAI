import type { IPolicyResolver } from './policy-resolution.contract';
import type { IResolvedCommand } from './policy-resolution.contract';

// Re-export the contract so existing consumers can keep
// importing from `policy-resolver.ts` while new code is
// steered at `policy-resolution.contract.ts`. This is a
// one-release compatibility shim — the proposal f00051 S11
// commits to retiring the re-export after the next minor.
export type {
	PolicyLayer,
	IResolvedCommand,
	IPolicyResolutionInput,
	IPolicyResolver,
} from './policy-resolution.contract';

/**
 * f00051 / S11 — `policy-resolver.ts`
 *
 * The default `IPolicyResolver` implementation.
 *
 * Single Responsibility: this file is the **only** place the
 * priority order (`project > dogma > default`) is encoded.
 * The tools never branch on the priority themselves; they call
 * `resolveCommand(input)` and read the structured result.
 *
 * Dependency Inversion: tools depend on the
 * `IPolicyResolver` interface (in
 * `policy-resolution.contract.ts`), not on this concrete
 * constant. A host can swap in a different policy (e.g. a
 * "treat dogma as advisory" policy for projects that opt in
 * via `mcp-vertex.config.json#plugins.rules.policy`) without
 * touching the tools.
 *
 * The default rationale strings are deliberately
 * agent-facing: the resolved command's `rationale` is what
 * `apply_rules` echoes back to the user, and it must explain
 * *why* the lower layers were ignored, not just announce the
 * winner.
 */

/**
 * The f00051 priority order: project config wins, then
 * language dogma, then the plugin's vendored default.
 *
 * This is the **single source of truth** for the priority
 * order across all three tools. Adding a new layer (e.g. a
 * "user override via config") means adding one branch here —
 * no tool changes.
 */
export const PROJECT_OVER_DOGMA_OVER_DEFAULT: IPolicyResolver = {
	resolveCommand({
		areaDir,
		fromProject,
		fromDogma,
		fromDefault,
	}): IResolvedCommand {
		if (fromProject !== undefined) {
			return {
				effective: 'project',
				command: fromProject.checkCommand,
				rationale:
					`Project ships its own linter config for "${areaDir}"; project wins (priority: project > dogma > default). ` +
					`The dogma is your guide for NEW code, not for running the existing toolchain.`,
				fromProject,
				fromDefault,
				...(fromDogma !== undefined ? { fromDogma } : {}),
			};
		}
		if (fromDogma !== undefined) {
			return {
				effective: 'dogma',
				command: fromDogma.checkCommand,
				rationale:
					`No project linter config for "${areaDir}"; falling back to the language dogma. ` +
					`The dogma is opinionated and aligned with the most-mainstream community conventions for this language.`,
				fromDogma,
				fromDefault,
			};
		}
		return {
			effective: 'default',
			command: fromDefault.checkCommand,
			rationale: `No project config, no dogma match for "${areaDir}"; running the plugin vendored default.`,
			fromDefault,
		};
	},
};

/**
 * Build a policy resolver at boot. Today this just returns
 * the default constant; the function exists so a future slice
 * (a host-supplied override) can swap implementations
 * without changing call sites. Tests can pass any
 * `IPolicyResolver` directly via `IRulesToolOptions`.
 *
 * Prefer passing `IPolicyResolver` via
 * `IRulesToolOptions.policyResolver` (DIP) over a runtime
 * factory call. Kept for callers that have not migrated yet.
 */
export const buildDefaultPolicyResolver = (): IPolicyResolver =>
	PROJECT_OVER_DOGMA_OVER_DEFAULT;
