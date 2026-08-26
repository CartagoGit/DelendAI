import type {
	ClientCapabilities,
	Implementation,
} from '@modelcontextprotocol/sdk/types.js';

import type { IMcpToolSurfaceMode } from '../contracts/interfaces/surface-mode.interface';

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

export const shouldRegisterSurfaceRouter = (
	// The router is registered in every mode and hidden only by the runtime
	// when native compatibility mode is selected.
	_explicitMode: IMcpToolSurfaceMode | undefined,
): boolean => true;

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
	return {
		mode: 'managed',
		reason: 'using managed surface as the stable default; client capabilities do not change the stable tools/list contract',
	};
};
