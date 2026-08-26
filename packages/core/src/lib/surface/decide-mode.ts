import type {
	ClientCapabilities,
	Implementation,
} from '@modelcontextprotocol/sdk/types.js';

import type { IMcpToolSurfaceMode } from '../contracts/interfaces/surface-mode.interface';
import { detectClientSurfaceCapabilities } from './client-capabilities';

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
): IMcpToolSurfaceMode => explicitMode ?? 'native';

export const shouldRegisterSurfaceRouter = (
	// r00027 (TOK-004 follow-up): the silent default is now `native`, so
	// the router is no longer needed for ordinary MCP clients. Only opt
	// in (compact / adaptive) flips the router on.
	explicitMode: IMcpToolSurfaceMode | undefined,
): boolean => explicitMode === 'adaptive' || explicitMode === 'compact';

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
	const detected = detectClientSurfaceCapabilities(input);
	if (detected.listChangedSupport) {
		return {
			mode: 'adaptive',
			reason: 'client declared tools list-changed support; using adaptive surface',
		};
	}
	if (detected.preferredMode === 'compact') {
		return {
			mode: 'compact',
			reason: 'client requested compact surface without tools list-changed support',
		};
	}
	// r00027 (TOK-004 follow-up): invert the default once more. r00026 made
	// `adaptive` the silent default on the theory that spec-compliant
	// MCP clients are obliged to re-fetch `tools/list` after a
	// `notifications/tools/list_changed` notification. In practice the
	// most common clients (VS Code's MCP extension, the
	// `mcp-vertex` shim, several generic hosts) do NOT re-fetch on
	// that notification when the client never declared the capability,
	// which is the default for every spec-compliant client. The result
	// is the operator sees "Discovered 6 tools" and never sees the
	// rest, even though the server has more. `native` is the right
	// default: every tool of every loaded plugin shows up on the
	// first `tools/list` without depending on notification handling.
	// The token cost is bounded by the preset-metadata measurement
	// (r00024 / PRESET-001) and the `tokens:gate` lint. Adopters that
	// want `adaptive` (token-optimised) can opt in via
	// `--surface=adaptive` or `mcp-vertex.config.json#surfaceMode`.
	return {
		mode: 'native',
		reason: 'using native surface as the silent default (r00027); adaptive remains available as an explicit override',
	};
};
