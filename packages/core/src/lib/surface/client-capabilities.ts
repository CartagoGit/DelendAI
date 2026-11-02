import type {
	ClientCapabilities,
	Implementation,
} from '@modelcontextprotocol/sdk/types.js';

import type { IMcpToolSurfaceMode } from '../contracts/interfaces/surface-mode.interface';

export interface IDetectedClientSurfaceCapabilities {
	readonly listChangedSupport: boolean;
	readonly preferredMode?: IMcpToolSurfaceMode | undefined;
	readonly source: 'extensions' | 'experimental' | 'none';
	readonly clientName?: string | undefined;
}

const SURFACE_EXTENSION_KEY = 'delendai/surface';

const readSurfaceExtension = (
	capabilities: ClientCapabilities | undefined,
): Record<string, unknown> | undefined => {
	const extension = capabilities?.extensions?.[SURFACE_EXTENSION_KEY];
	if (extension && typeof extension === 'object') {
		return extension as Record<string, unknown>;
	}
	const experimental = capabilities?.experimental?.[SURFACE_EXTENSION_KEY];
	if (experimental && typeof experimental === 'object') {
		return experimental as Record<string, unknown>;
	}
	return undefined;
};

const readPreferredMode = (value: unknown): IMcpToolSurfaceMode | undefined => {
	return value === 'managed' ||
		value === 'adaptive' ||
		value === 'compact' ||
		value === 'native'
		? value
		: undefined;
};

export const detectClientSurfaceCapabilities = (input: {
	clientInfo?: Implementation | undefined;
	capabilities?: ClientCapabilities | undefined;
}): IDetectedClientSurfaceCapabilities => {
	const surfaceExtension = readSurfaceExtension(input.capabilities);
	if (surfaceExtension !== undefined) {
		return {
			listChangedSupport:
				surfaceExtension.toolsListChanged === true ||
				surfaceExtension.toolListChanged === true,
			...(readPreferredMode(surfaceExtension.preferredMode) !== undefined
				? {
						preferredMode: readPreferredMode(
							surfaceExtension.preferredMode,
						),
					}
				: {}),
			source:
				input.capabilities?.extensions?.[SURFACE_EXTENSION_KEY] !==
				undefined
					? 'extensions'
					: 'experimental',
			...(input.clientInfo?.name !== undefined
				? { clientName: input.clientInfo.name }
				: {}),
		};
	}
	return {
		listChangedSupport: false,
		source: 'none',
		...(input.clientInfo?.name !== undefined
			? { clientName: input.clientInfo.name }
			: {}),
	};
};
