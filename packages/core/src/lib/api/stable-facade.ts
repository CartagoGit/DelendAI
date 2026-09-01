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

import {
	composeStableToolDescriptors,
	onStableToolRegistryChange,
} from './stable-facade-registry';

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

/** Core-owned stable descriptors; plugin descriptors come from the registry. */
export const CORE_STABLE_API_TOOLS: readonly IStableToolDescriptor[] =
	Object.freeze([]);

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
const stableApiTools: IStableToolDescriptor[] = [];
const stableApiToolNames: string[] = [];

const refreshStableFacade = (): void => {
	const descriptors = composeStableToolDescriptors(CORE_STABLE_API_TOOLS);
	stableApiTools.splice(0, stableApiTools.length, ...descriptors);
	stableApiToolNames.splice(
		0,
		stableApiToolNames.length,
		...descriptors.map((descriptor) => descriptor.name),
	);
};

refreshStableFacade();
onStableToolRegistryChange(refreshStableFacade);

export const STABLE_API_TOOLS: readonly IStableToolDescriptor[] =
	stableApiTools;

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
export const STABLE_API_TOOL_NAMES: readonly string[] = stableApiToolNames;

export {
	clearStableToolDescriptorContributions,
	listRegisteredStableToolDescriptors,
	registerStableToolDescriptors,
	resetStableToolDescriptorRegistryForTests,
} from './stable-facade-registry';
