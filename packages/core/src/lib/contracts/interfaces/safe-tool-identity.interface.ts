declare const SAFE_TOOL_ID_BRAND: unique symbol;

export type ToolOwner =
	| 'delendai'
	| 'first-party-host'
	| 'external-mcp'
	| 'host-project';

export type SafeToolCategory =
	| 'orchestration'
	| 'analysis'
	| 'file'
	| 'network'
	| 'process'
	| 'reporting'
	| 'external-bridge'
	| 'host-specific'
	| 'unknown';

export type SafeToolId = string & {
	readonly [SAFE_TOOL_ID_BRAND]: 'SafeToolId';
};

export interface ISafeToolIdentity {
	readonly owner: ToolOwner;
	readonly safeToolId?: SafeToolId | undefined;
	readonly category: SafeToolCategory;
}

export interface IToolRegistryEntry {
	readonly packageName: string;
	readonly owner: ToolOwner;
	readonly publicToolName?: string | undefined;
	readonly category?: SafeToolCategory | undefined;
}

export interface IToolIdentityRegistry {
	get(toolName: string): IToolRegistryEntry | undefined;
	list(): ReadonlyMap<string, IToolRegistryEntry>;
}
