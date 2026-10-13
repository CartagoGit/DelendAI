import type {
	ClientCapabilities,
	Implementation,
} from '@modelcontextprotocol/sdk/types.js';

import type { IMcpToolSurfaceMode } from '../contracts/interfaces/surface-mode.interface';
import { detectClientSurfaceCapabilities } from './client-capabilities';
import { matchHostModeProfile } from './host-mode-profiles.constant';

export interface ISurfaceModeDecision {
	readonly mode: IMcpToolSurfaceMode;
	readonly reason: string;
}

export const resolveExplicitSurfaceMode = (input: {
	cliMode: IMcpToolSurfaceMode;
	cliSurfaceExplicit: boolean;
	configMode?: IMcpToolSurfaceMode | undefined;
}): IMcpToolSurfaceMode | undefined =>
	input.cliSurfaceExplicit ? input.cliMode : input.configMode;

export const resolveInitialSurfaceMode = (
	explicitMode: IMcpToolSurfaceMode | undefined,
): IMcpToolSurfaceMode => explicitMode ?? 'managed';

/**
 * The router (`delendai_compact_router`) is the single canonical
 * compact entry point. The legacy brand prefix was retired in the
 * b00239 migration — see `compact-router.tool.ts`. This router
 * is registered in every mode this
 * function is asked about — `native` only HIDES it from `tools/list`
 * (see `shouldExpose()` in `tool-surface-runtime.service.ts`), it never
 * stops the router from working, because a native host that later
 * switches modes at runtime (or an operator who mis-set the override)
 * must still be able to route. `explicitMode` is read (not just
 * accepted) so this stays a real decision instead of a constant with an
 * unread parameter (AUD-C01): both branches are enumerated on purpose.
 */
export const shouldRegisterSurfaceRouter = (
	explicitMode: IMcpToolSurfaceMode | undefined,
): boolean => {
	switch (explicitMode) {
		case 'native':
		case 'managed':
		case 'adaptive':
		case 'compact':
		case undefined:
			return true;
	}
};

/**
 * Resolve the effective surface mode. Precedence, highest first:
 *
 *   1. `explicitMode` — an operator/config override always wins.
 *   2. A known host profile (`host-mode-profiles.constant.ts`, the code
 *      form of `host-compatibility-matrix.md`) — a host this repo has
 *      already verified keeps exactly the mode the matrix documents,
 *      regardless of what capabilities it declares.
 *   3. Capability detection (`detectClientSurfaceCapabilities`) — an
 *      unrecognised host that declares `delendai/surface` support
 *      gets `managed`; one that declares nothing gets `native`, because
 *      an unknown client with no signal that it can discover
 *      lazily-activated tools must not be handed a surface where most
 *      tools are invisible until it re-lists (AUD-C01).
 *
 * `ClientCapabilities` (the SDK's own type) has no standard `tools`
 * field for clients to declare — `tools.listChanged` is a SERVER
 * capability, not a client one. The audit's literal snippet
 * (`capabilities.tools.listChanged`) does not exist on the wire; the
 * real, already-built equivalent signal is the `delendai/surface`
 * extension `detectClientSurfaceCapabilities` reads.
 */
export const decideSurfaceModeFromCapabilities = (input: {
	clientInfo?: Implementation | undefined;
	capabilities?: ClientCapabilities | undefined;
	explicitMode?: IMcpToolSurfaceMode | undefined;
}): ISurfaceModeDecision => {
	if (input.explicitMode !== undefined) {
		return {
			mode: input.explicitMode,
			reason: `explicit surface override -> ${input.explicitMode}`,
		};
	}
	const profile = matchHostModeProfile(input.clientInfo?.name);
	if (profile !== undefined) {
		return { mode: profile.mode, reason: profile.rationale };
	}
	const detected = detectClientSurfaceCapabilities({
		clientInfo: input.clientInfo,
		capabilities: input.capabilities,
	});
	if (detected.listChangedSupport) {
		return {
			mode: 'managed',
			reason: `client "${input.clientInfo?.name ?? 'unknown'}" declared delendai/surface listChanged support -> managed`,
		};
	}
	return {
		mode: 'native',
		reason: `client "${input.clientInfo?.name ?? 'unknown'}" matches no known host profile and declared no listChanged support (source: ${detected.source}); native avoids stranding lazily-activated tools behind a notification the client may never act on`,
	};
};
