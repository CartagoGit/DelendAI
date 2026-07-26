/**
 * stable-facade.ts — f00152 S2 (L4 — stable facade).
 *
 * The "Stable API Surface" is a small, named subset of tools that the
 * `@mcp-vertex/core` project guarantees will not break on a minor or
 * patch release. Tools outside the fence may change shape, name or
 * vanish on any release; tools inside the fence can only be removed
 * after a two-release deprecation cycle.
 *
 * SOLID notes:
 *   - **OCP**: a tool is added by appending a descriptor; existing
 *     descriptors never mutate.
 *   - **DIP**: callers consume the immutable `STABLE_API_TOOLS`
 *     array; the manifest builder iterates over it without knowing
 *     which plugin each tool lives in.
 *   - **SRP**: this file declares the facade. Schema validation lives
 *     in `stable-manifest.ts` (the manifest builder). The CLI script
 *     lives in `tools/scripts/build/stable-manifest.script.ts`.
 *
 * Adding a new tool:
 *   1. Append a `describeStableTool({ ... })` entry below.
 *   2. Run `bun run build:stable-manifest` to regenerate the
 *      committed manifest.
 *   3. CI (`verify:stable-manifest`) ensures the manifest is fresh.
 */
import type { ZodTypeAny } from 'zod';

import { SCHEMA_VERSION } from './stable-manifest';

/**
 * The semver guarantee attached to every facade tool. Today the
 * project promises `additive-only` — fields may be added but never
 * renamed or removed without a two-release deprecation. Future values
 * (e.g. `'frozen'`) are reserved for tools we want pinned forever.
 */
export type TStableSemverGuarantee = 'additive-only';

/**
 * Immutable descriptor for one facade tool. The descriptor is the
 * single source of truth — the manifest builder, the verifier and
 * any docs-page generator all read from the array.
 */
export interface IStableToolDescriptor {
	readonly name: string;
	readonly plugin: string;
	readonly sinceVersion: string;
	readonly semverGuarantee: TStableSemverGuarantee;
	readonly inputSchema: ZodTypeAny;
	readonly outputSchema: ZodTypeAny;
	/**
	 * One-line description surfaced in the manifest and the docs
	 * site. Kept short on purpose: the facade is a stable surface
	 * and short descriptions are easier to keep accurate over time.
	 */
	readonly summary: string;
}

/**
 * Pure factory — every descriptor is frozen at creation. Adding a
 * field here is a breaking change to the contract, so we keep the
 * factory thin and direct.
 */
export const describeStableTool = (
	descriptor: IStableToolDescriptor,
): IStableToolDescriptor => Object.freeze({ ...descriptor });

/**
 * The Stable API Surface. Order is declaration order; consumers that
 * care about the order should iterate this array directly.
 *
 * Adding a tool:
 *   - Bump `SCHEMA_VERSION` (the manifest's `version`) in
 *     `stable-manifest.ts` when the facade itself changes shape.
 *   - Set `sinceVersion` to the package version that first declares
 *     the descriptor (not the version of the tool, which may predate
 *     the facade).
 *
 * Removing a tool:
 *   - Two-release deprecation cycle. Mark the descriptor as
 *     `@deprecated` in a comment, leave it here for one release,
 *     remove it on the release that follows. The verifier checks
 *     that the manifest never references a tool the descriptor
 *     doesn't list, so leaving a `sinceVersion` ghost is safe.
 */
export const STABLE_API_TOOLS: readonly IStableToolDescriptor[] = Object.freeze(
	[
		describeStableTool({
			name: 'proposal_transition',
			plugin: 'proposals',
			sinceVersion: SCHEMA_VERSION,
			semverGuarantee: 'additive-only',
			// Schemas are bound at runtime in `bindStableSchemas()` so this
			// file does not have to import every plugin's tool module
			// (which would create a circular dependency between core and
			// the proposals plugin). The factory below exposes the
			// descriptor's schema slots for late binding.
			inputSchema: undefined as unknown as ZodTypeAny,
			outputSchema: undefined as unknown as ZodTypeAny,
			summary: 'Move a proposal to a new status against the DFA.',
		}),
		describeStableTool({
			name: 'proposal_create',
			plugin: 'proposals',
			sinceVersion: SCHEMA_VERSION,
			semverGuarantee: 'additive-only',
			inputSchema: undefined as unknown as ZodTypeAny,
			outputSchema: undefined as unknown as ZodTypeAny,
			summary:
				'Create a new proposal document with frontmatter + slices.',
		}),
		describeStableTool({
			name: 'auto_work',
			plugin: 'proposals',
			sinceVersion: SCHEMA_VERSION,
			semverGuarantee: 'additive-only',
			inputSchema: undefined as unknown as ZodTypeAny,
			outputSchema: undefined as unknown as ZodTypeAny,
			summary:
				'Resolve the next proposal slice and return an action plan.',
		}),
		describeStableTool({
			name: 'agent_lock',
			plugin: 'proposals',
			sinceVersion: SCHEMA_VERSION,
			semverGuarantee: 'additive-only',
			inputSchema: undefined as unknown as ZodTypeAny,
			outputSchema: undefined as unknown as ZodTypeAny,
			summary: 'Claim file ownership for an agent (cross-process lock).',
		}),
		describeStableTool({
			name: 'agent_worktree',
			plugin: 'proposals',
			sinceVersion: SCHEMA_VERSION,
			semverGuarantee: 'additive-only',
			inputSchema: undefined as unknown as ZodTypeAny,
			outputSchema: undefined as unknown as ZodTypeAny,
			summary: 'Create or manage per-agent git worktrees.',
		}),
		describeStableTool({
			name: 'proposal_review',
			plugin: 'proposals',
			sinceVersion: SCHEMA_VERSION,
			semverGuarantee: 'additive-only',
			inputSchema: undefined as unknown as ZodTypeAny,
			outputSchema: undefined as unknown as ZodTypeAny,
			summary: 'Submit/approve/request-changes on a proposal in review.',
		}),
		describeStableTool({
			name: 'task_queue_enqueue',
			plugin: 'proposals',
			sinceVersion: SCHEMA_VERSION,
			semverGuarantee: 'additive-only',
			inputSchema: undefined as unknown as ZodTypeAny,
			outputSchema: undefined as unknown as ZodTypeAny,
			summary: 'Push a task onto the persistent swarm queue.',
		}),
		describeStableTool({
			name: 'state_repair',
			plugin: 'proposals',
			sinceVersion: SCHEMA_VERSION,
			semverGuarantee: 'additive-only',
			inputSchema: undefined as unknown as ZodTypeAny,
			outputSchema: undefined as unknown as ZodTypeAny,
			summary:
				'Auto-heal stale locks, queue backpressure, orphan assignments.',
		}),
		describeStableTool({
			name: 'proposal_force_transition',
			plugin: 'proposals',
			sinceVersion: SCHEMA_VERSION,
			semverGuarantee: 'additive-only',
			inputSchema: undefined as unknown as ZodTypeAny,
			outputSchema: undefined as unknown as ZodTypeAny,
			summary: 'Recovery-path transition (skips peer-review lock).',
		}),
	],
);

/**
 * Find a facade descriptor by tool name. Pure; returns `null` when
 * the name is not on the facade. Used by the manifest builder and
 * any docs-site generator.
 */
export const findStableDescriptor = (
	name: string,
): IStableToolDescriptor | null =>
	STABLE_API_TOOLS.find((descriptor) => descriptor.name === name) ?? null;

/**
 * The list of facade tool names, in declaration order. Useful for
 * snapshot-style tests and the deprecation linter.
 */
export const STABLE_API_TOOL_NAMES: readonly string[] = Object.freeze(
	STABLE_API_TOOLS.map((descriptor) => descriptor.name),
);
