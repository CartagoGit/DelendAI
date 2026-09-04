import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import type {
	ClientCapabilities,
	Implementation,
} from '@modelcontextprotocol/sdk/types.js';
import {
	type IMcpToolSurfaceMode,
	type IPresetKind,
} from '@delendai/core/public';
import {
	jsonBytes,
	type IToolComponentBytes,
} from './tool-component-breakdown.helper';
export { jsonBytes };
export interface IConnectedBudgetClient {
	readonly client: Client;
	readonly pluginIds: readonly string[];
	readonly loadErrors: readonly string[];
	readonly close: () => Promise<void>;
}
export declare const DYNAMIC_SURFACE_CLIENT_CAPABILITIES: ClientCapabilities;
export declare const DYNAMIC_SURFACE_CLIENT_INFO: Implementation;
export interface IToolOwnerMetrics {
	readonly owner: string;
	readonly toolCount: number;
	readonly toolsListBytes: number;
	readonly schemaBytes: number;
	readonly descriptionBytes: number;
	readonly inputSchemaBytes: number;
	readonly outputSchemaBytes: number;
	readonly annotationsBytes: number;
	readonly otherFieldBytes: number;
	readonly envelopeBytes: number;
}
/** One tool's component breakdown, tagged with the owner it rolls up into. */
export interface IToolBreakdownRow extends IToolComponentBytes {
	readonly owner: string;
}
export interface IToolListMetrics {
	readonly toolCount: number;
	readonly toolsListBytes: number;
	readonly schemaBytes: number;
	readonly descriptionBytes: number;
	readonly inputSchemaBytes: number;
	readonly outputSchemaBytes: number;
	readonly annotationsBytes: number;
	readonly otherFieldBytes: number;
	readonly envelopeBytes: number;
	readonly maxPluginBytes: number;
	readonly ownerRows: readonly IToolOwnerMetrics[];
	/** Per-tool component breakdown; parts sum to `totalBytes` for every row. */
	readonly toolBreakdowns: readonly IToolBreakdownRow[];
}
export type IToolListEntry = {
	readonly name: string;
	readonly description?: string | undefined;
	readonly inputSchema?: unknown | undefined;
	readonly outputSchema?: unknown | undefined;
};
export declare const classifyToolOwner: (
	toolName: string,
	pluginIds: readonly string[],
) => string;
export declare const measureToolListMetrics: (
	tools: readonly IToolListEntry[],
	pluginIds: readonly string[],
) => IToolListMetrics;
export declare const createTokenBudgetFixtureWorkspace: () => string;
export declare const destroyTokenBudgetFixtureWorkspace: (
	workspace: string,
) => void;
export declare const connectTokenBudgetClient: (
	workspace: string,
	options: {
		readonly pluginList: string;
		readonly preset?: boolean;
		readonly surfaceMode?: IMcpToolSurfaceMode;
		readonly clientInfo?: Implementation;
		readonly capabilities?: ClientCapabilities;
	},
) => Promise<IConnectedBudgetClient>;
export declare const measureToolTextBytes: (
	client: Client,
	name: string,
	args: Record<string, unknown>,
) => Promise<number>;
export declare const seedAutoWorkReadyProposal: (
	workspace: string,
	client: Client,
) => Promise<void>;
export declare const listToolsMetrics: (
	client: Client,
	pluginIds: readonly string[],
) => Promise<IToolListMetrics>;
export declare const asPresetId: (value: string) => IPresetKind;
/**
 * The exact JSON text the `tools/list` byte count is derived from. Real
 * tokenizers need this text (not just its byte length) to produce a
 * measured token count instead of a byte-ratio estimate.
 */
export declare const toolsListJsonText: (
	tools: readonly IToolListEntry[],
) => string;
