import type { PluginOrigin } from '@mcp-vertex/core/contracts';

export interface ISetPluginActivationInput {
	readonly workspaceRoot: string;
	readonly id: string;
	readonly origin: PluginOrigin;
	readonly active: boolean;
	readonly configFileName?: string;
}

export interface ISetPluginActivationResult {
	readonly configFile: string;
	readonly id: string;
	readonly active: boolean;
	readonly changed: boolean;
}
