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
): IMcpToolSurfaceMode => explicitMode ?? 'adaptive';

export const shouldRegisterSurfaceRouter = (
	explicitMode: IMcpToolSurfaceMode | undefined,
): boolean => explicitMode !== 'native';

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
	// r00026 (TOK-004): `adaptive` is now the default for every MCP client,
	// not only ones that declare the private `mcp-vertex/surface`
	// extension. The MCP spec has no client-side capability to negotiate
	// `notifications/tools/list_changed` handling — any spec-compliant
	// client is already expected to tolerate it — so gating the smaller,
	// cheaper surface behind a Vertex-private opt-in left every ordinary
	// MCP host on the full `native` surface by default, the opposite of
	// what r00019 (q00004) already decided and the token dashboard
	// measures against. A client that never re-fetches `tools/list`
	// after the notification is NOT left broken: `mcp-vertex_vertex`
	// (the domain/action router) and `mcp-vertex_tool_search` stay in the
	// bootstrap set precisely so any tool remains reachable without a
	// refresh (see `tool-surface.e2e.spec.ts`'s
	// "does not leave a client that never refreshes tools/list unable to
	// reach an activated tool" case). `native` is the explicit,
	// documented compatibility fallback (`--surface=native` /
	// `mcp-vertex.config.json#surfaceMode`), never the silent default.
	return {
		mode: 'adaptive',
		reason: 'client did not declare tools list-changed support; using adaptive surface (default since r00026 / TOK-004) — native remains available as an explicit override',
	};
};
