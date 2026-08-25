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
	return {
		mode: 'native',
		reason: 'client did not declare tools list-changed support; using native surface',
	};
};
