import type { IKnowledgeEntry } from './knowledge.interface';
import type { IMcpToolSurfaceMode } from './surface-mode.interface';

export interface IToolSurfaceDescriptor {
	readonly registrationId: string;
	readonly name: string;
	readonly toolId: string;
	readonly pluginId?: string | undefined;
	readonly namespace?: string | undefined;
	readonly summary?: string | undefined;
	readonly tags?: readonly string[] | undefined;
}

export interface IToolSurfacePluginDescriptor {
	readonly id: string;
	readonly namespace: string;
	readonly describe?: string | undefined;
	readonly toolRegistrationIds: readonly string[];
}

export interface IToolSurfacePlan {
	readonly mode: IMcpToolSurfaceMode;
	readonly explicitMode?: IMcpToolSurfaceMode | undefined;
	readonly bootstrapToolIds: readonly string[];
	readonly routerToolId?: string | undefined;
	readonly descriptors: readonly IToolSurfaceDescriptor[];
	readonly plugins: readonly IToolSurfacePluginDescriptor[];
}

export interface IToolSurfaceModeChange {
	readonly previousMode: IMcpToolSurfaceMode;
	readonly mode: IMcpToolSurfaceMode;
	readonly changedToolNames: readonly string[];
	readonly visibleToolNames: readonly string[];
}

export interface IToolSurfaceSearchEntry extends IToolSurfaceDescriptor {
	readonly active: boolean;
	readonly detailsId: string;
}

export interface IPluginSurfaceChange {
	readonly pluginId: string;
	readonly namespace: string;
	readonly active: boolean;
	readonly changedToolNames: readonly string[];
	readonly visibleToolNames: readonly string[];
	readonly note?: string | undefined;
}

export interface IProjectContextSnapshot {
	readonly surfaceMode: IMcpToolSurfaceMode;
	readonly workspaceRoot: string;
	readonly cacheDir?: string | undefined;
	readonly docsDir?: string | undefined;
	readonly configIssues: readonly string[];
	readonly loadedPlugins: readonly string[];
	readonly visibleToolCount: number;
	readonly hiddenToolCount: number;
	readonly visibleDomains: readonly string[];
}

export interface IToolSurfaceRuntime {
	readonly mode: IMcpToolSurfaceMode;
	bindRegisteredTool(input: {
		readonly registrationId: string;
		readonly name: string;
		readonly description?: string | undefined;
		readonly inputSchema?: unknown;
		readonly outputSchema?: unknown;
		readonly handler: unknown;
		readonly handle: {
			enabled: boolean;
			enable(): void;
			disable(): void;
		};
	}): void;
	finalizeInitialSurface(): void;
	applySurfaceMode(mode: IMcpToolSurfaceMode): IToolSurfaceModeChange;
	publicDescriptionFor(
		registrationId: string,
		original: string | undefined,
		fallbackSummary: string | undefined,
	): string | undefined;
	isToolExposed(name: string): boolean;
	listToolKnowledgeEntries(): ReadonlyArray<
		Pick<IKnowledgeEntry, 'id' | 'title'>
	>;
	getToolKnowledgeEntry(id: string): IKnowledgeEntry | undefined;
	searchTools(input?: {
		readonly query?: string | undefined;
		readonly activeOnly?: boolean | undefined;
		readonly plugin?: string | undefined;
		readonly tag?: string | undefined;
		readonly limit?: number | undefined;
	}): readonly IToolSurfaceSearchEntry[];
	activatePlugin(identifier: string): IPluginSurfaceChange | null;
	deactivatePlugin(identifier: string): IPluginSurfaceChange | null;
	getProjectContext(input: {
		readonly workspaceRoot: string;
		readonly cacheDir?: string | undefined;
		readonly docsDir?: string | undefined;
		readonly configIssues?: readonly string[] | undefined;
	}): IProjectContextSnapshot;
	resolveRoute(
		domain: string,
		action: string,
	): IToolSurfaceSearchEntry | undefined;
	invokeTool(name: string, args: unknown, extra: unknown): Promise<unknown>;
}

export interface IToolSurfaceRuntimeAccess {
	get(): IToolSurfaceRuntime | undefined;
	bind(runtime: IToolSurfaceRuntime): void;
}
