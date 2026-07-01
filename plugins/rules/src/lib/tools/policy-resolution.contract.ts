import type { ICommandSet } from '../frameworks/contracts';

/**
 * f00051 / S11 — `policy-resolution.contract.ts`
 *
 * Single Responsibility: this file is the **only** place that
 * declares the policy-resolution contract — the interface, the
 * priority-layer enum, the per-area input shape, and the
 * per-area output shape. It is pure types; the implementation
 * lives in `policy-resolver.ts` (the default policy) and the
 * renderer abstraction lives in `dogma-policy.provider.ts`.
 *
 * Dependency Inversion: every tool (`get_rules`,
 * `check_rules`, `apply_rules`) depends on these interfaces,
 * not on the concrete `PROJECT_OVER_DOGMA_OVER_DEFAULT`
 * resolver or the concrete `StringDogmaPolicyProvider`. A
 * host can swap either by passing a different instance to
 * `IRulesToolOptions`.
 *
 * Why this lives in its own file (not inside
 * `policy-resolver.ts`): the contract is **read by N
 * consumers** (composition root, factory, tools, knowledge,
 * tests); keeping it separate from the implementation keeps
 * the dependency arrows pointing *to* the contract — never
 * *to* the default — and lets a test import the interface
 * without pulling the default implementation into the
 * dependency graph.
 */

/**
 * The three priority layers a `IPolicyResolver` consults,
 * ordered from highest to lowest:
 *
 *   1. `project` — the project's own linter config (if any)
 *   2. `dogma`   — the language dogma (the agent's guide for
 *                  new code; the project's toolchain is the
 *                  enforcer for existing code)
 *   3. `default` — the plugin's vendored preset under
 *                  `.cache/mcp-vertex/rules/`
 *
 * The `effective` field of `IResolvedCommand` reports which
 * layer won for a given area.
 */
export type PolicyLayer = 'project' | 'dogma' | 'default';

/**
 * The structured answer a policy resolver returns for one
 * area. The agent surfaces this directly via `check_rules`'s
 * `evidence` field and `apply_rules`'s step text, so the
 * user can read the decision rather than just the command.
 */
export interface IResolvedCommand {
	/** Which layer the *effective* command came from. */
	readonly effective: PolicyLayer;
	/** The command the agent should run. */
	readonly command: string;
	/**
	 * Human-readable explanation of *why* this command was
	 * chosen and *why* the lower layers were ignored.
	 * Surfaced in `check_rules.evidence` and
	 * `apply_rules.steps` so the agent can render the
	 * decision to the user.
	 */
	readonly rationale: string;
	/**
	 * Per-layer command sets. `fromProject` is present iff
	 * the area has a project linter config; `fromDogma` is
	 * present iff the language dogma resolved; `fromDefault`
	 * is always present (the vendored preset is the floor).
	 */
	readonly fromProject?: ICommandSet;
	readonly fromDogma?: ICommandSet;
	readonly fromDefault: ICommandSet;
}

/**
 * One area + its full resolution. Interface Segregation: the
 * resolver depends on the narrow shape it needs (the three
 * command sets, one per layer, plus the area dir for context),
 * not on the full `IAreaRules` domain shape.
 */
export interface IPolicyResolutionInput {
	readonly areaDir: string;
	readonly fromProject?: ICommandSet;
	readonly fromDogma?: ICommandSet;
	readonly fromDefault: ICommandSet;
}

/**
 * The Dependency-Inversion seam: every consumer (the
 * composition root, the tools, the tests, a future host) takes
 * an `IPolicyResolver` and calls `resolveCommand(input)`. The
 * implementation encodes the priority order exactly once
 * (SRP at the tool level — the tools never branch on the
 * priority themselves).
 */
export interface IPolicyResolver {
	resolveCommand(input: IPolicyResolutionInput): IResolvedCommand;
}
