import type { RegisteredTool } from '@modelcontextprotocol/sdk/server/mcp.js';

import type { IKnowledgeEntry } from '../contracts/interfaces/knowledge.interface';
import type {
	IPluginSurfaceChange,
	IProjectContextSnapshot,
	IToolSurfacePlan,
	IToolSurfaceRuntime,
	IToolSurfaceRuntimeAccess,
	IToolSurfaceSearchEntry,
} from '../contracts/interfaces/tool-surface.interface';
import {
	buildToolKnowledgeEntry,
	compactDescription,
	safeParseSurfaceArgs,
	TOOL_DETAILS_PREFIX,
} from './tool-surface-runtime.helper';

const DEFAULT_SEARCH_LIMIT = 20;

interface IBoundToolRecord {
	readonly registrationId: string;
	readonly name: string;
	readonly toolId: string;
	readonly pluginId?: string | undefined;
	readonly namespace?: string | undefined;
	readonly summary?: string | undefined;
	readonly tags?: readonly string[] | undefined;
	readonly detailsId: string;
	readonly description?: string | undefined;
	readonly inputSchema?: unknown;
	readonly outputSchema?: unknown;
	readonly handler: unknown;
	readonly handle: RegisteredTool;
}
const matchesFilter = (
	record: IBoundToolRecord,
	input: Parameters<IToolSurfaceRuntime['searchTools']>[0],
): boolean => {
	if (input?.activeOnly === true && !record.handle.enabled) return false;
	if (input?.plugin !== undefined) {
		const plugin = input.plugin.toLowerCase();
		const pluginHit =
			record.pluginId?.toLowerCase() === plugin ||
			record.namespace?.toLowerCase() === plugin;
		if (!pluginHit) return false;
	}
	if (
		input?.tag !== undefined &&
		!(record.tags ?? []).some(
			(tag) => tag.toLowerCase() === input.tag!.toLowerCase(),
		)
	) {
		return false;
	}
	if (input?.query === undefined || input.query.trim().length === 0) {
		return true;
	}
	const needle = input.query.toLowerCase();
	return [
		record.name,
		record.toolId,
		record.pluginId,
		record.namespace,
		record.summary,
		...(record.tags ?? []),
	]
		.filter((value): value is string => typeof value === 'string')
		.some((value) => value.toLowerCase().includes(needle));
};

class ToolSurfaceRuntime implements IToolSurfaceRuntime {
	readonly mode;

	private readonly recordsByName = new Map<string, IBoundToolRecord>();
	private readonly recordsByRegistrationId = new Map<
		string,
		IBoundToolRecord
	>();
	private readonly pluginIndex = new Map<
		string,
		{
			id: string;
			namespace: string;
			toolRegistrationIds: readonly string[];
		}
	>();

	constructor(private readonly plan: IToolSurfacePlan) {
		this.mode = plan.mode;
		for (const plugin of plan.plugins) {
			this.pluginIndex.set(plugin.id, plugin);
			this.pluginIndex.set(plugin.namespace, plugin);
		}
	}

	bindRegisteredTool(input: {
		readonly registrationId: string;
		readonly name: string;
		readonly description?: string | undefined;
		readonly inputSchema?: unknown;
		readonly outputSchema?: unknown;
		readonly handler: unknown;
		readonly handle: RegisteredTool;
	}): void {
		const descriptor = this.plan.descriptors.find(
			(entry) => entry.registrationId === input.registrationId,
		) ?? {
			registrationId: input.registrationId,
			name: input.name,
			toolId: input.registrationId,
		};
		const record: IBoundToolRecord = {
			...descriptor,
			detailsId: `${TOOL_DETAILS_PREFIX}${input.name}`,
			description: input.description,
			inputSchema: input.inputSchema,
			outputSchema: input.outputSchema,
			handler: input.handler,
			handle: input.handle,
		};
		this.recordsByName.set(record.name, record);
		this.recordsByRegistrationId.set(record.registrationId, record);
	}

	finalizeInitialSurface(): void {
		for (const record of this.recordsByName.values()) {
			if (this.shouldExpose(record.registrationId)) {
				continue;
			}
			record.handle.disable();
		}
	}

	isToolExposed(name: string): boolean {
		return this.recordsByName.get(name)?.handle.enabled ?? true;
	}

	listToolKnowledgeEntries(): ReadonlyArray<
		Pick<IKnowledgeEntry, 'id' | 'title'>
	> {
		return [...this.recordsByName.values()].map((record) => ({
			id: record.detailsId,
			title: `Tool ${record.name}`,
		}));
	}

	getToolKnowledgeEntry(id: string): IKnowledgeEntry | undefined {
		const record = [...this.recordsByName.values()].find(
			(entry) => entry.detailsId === id,
		);
		return record === undefined
			? undefined
			: buildToolKnowledgeEntry({
					id: record.detailsId,
					name: record.name,
					...(record.summary !== undefined
						? { summary: record.summary }
						: {}),
					...(record.pluginId !== undefined
						? { pluginId: record.pluginId }
						: {}),
					...(record.namespace !== undefined
						? { namespace: record.namespace }
						: {}),
					...(record.description !== undefined
						? { description: record.description }
						: {}),
				});
	}

	searchTools(input?: {
		readonly query?: string | undefined;
		readonly activeOnly?: boolean | undefined;
		readonly plugin?: string | undefined;
		readonly tag?: string | undefined;
		readonly limit?: number | undefined;
	}): readonly IToolSurfaceSearchEntry[] {
		const limit = input?.limit ?? DEFAULT_SEARCH_LIMIT;
		return [...this.recordsByName.values()]
			.filter((record) => matchesFilter(record, input))
			.slice(0, limit)
			.map((record) => ({
				registrationId: record.registrationId,
				name: record.name,
				toolId: record.toolId,
				...(record.pluginId !== undefined
					? { pluginId: record.pluginId }
					: {}),
				...(record.namespace !== undefined
					? { namespace: record.namespace }
					: {}),
				...(record.summary !== undefined
					? { summary: record.summary }
					: {}),
				...(record.tags !== undefined ? { tags: record.tags } : {}),
				active: record.handle.enabled,
				detailsId: record.detailsId,
			}));
	}

	activatePlugin(identifier: string): IPluginSurfaceChange | null {
		return this.setPluginState(identifier, true);
	}

	deactivatePlugin(identifier: string): IPluginSurfaceChange | null {
		return this.setPluginState(identifier, false);
	}

	getProjectContext(input: {
		readonly workspaceRoot: string;
		readonly cacheDir?: string | undefined;
		readonly docsDir?: string | undefined;
		readonly configIssues?: readonly string[] | undefined;
	}): IProjectContextSnapshot {
		const visibleToolCount = [...this.recordsByName.values()].filter(
			(record) => record.handle.enabled,
		).length;
		const visibleDomains = [
			...new Set(
				[...this.recordsByName.values()]
					.filter((record) => record.handle.enabled)
					.map(
						(record) =>
							record.namespace ?? record.pluginId ?? 'core',
					),
			),
		].sort();
		return {
			surfaceMode: this.mode,
			workspaceRoot: input.workspaceRoot,
			...(input.cacheDir !== undefined
				? { cacheDir: input.cacheDir }
				: {}),
			...(input.docsDir !== undefined ? { docsDir: input.docsDir } : {}),
			configIssues: [...(input.configIssues ?? [])],
			loadedPlugins: [
				...new Set(this.plan.plugins.map((plugin) => plugin.id)),
			].sort(),
			visibleToolCount,
			hiddenToolCount: this.recordsByName.size - visibleToolCount,
			visibleDomains,
		};
	}

	resolveRoute(
		domain: string,
		action: string,
	): IToolSurfaceSearchEntry | undefined {
		const domainLower = domain.toLowerCase();
		const actionLower = action.toLowerCase();
		const matches = [...this.recordsByName.values()].filter(
			(record) =>
				record.toolId.toLowerCase() === actionLower &&
				(record.namespace?.toLowerCase() === domainLower ||
					record.pluginId?.toLowerCase() === domainLower ||
					(domainLower === 'core' && record.pluginId === undefined)),
		);
		const found = matches[0];
		if (found === undefined) return undefined;
		return {
			registrationId: found.registrationId,
			name: found.name,
			toolId: found.toolId,
			...(found.pluginId !== undefined
				? { pluginId: found.pluginId }
				: {}),
			...(found.namespace !== undefined
				? { namespace: found.namespace }
				: {}),
			...(found.summary !== undefined ? { summary: found.summary } : {}),
			...(found.tags !== undefined ? { tags: found.tags } : {}),
			active: found.handle.enabled,
			detailsId: found.detailsId,
		};
	}

	async invokeTool(
		name: string,
		args: unknown,
		extra: unknown,
	): Promise<unknown> {
		const record = this.recordsByName.get(name);
		if (record === undefined) {
			throw new Error(`Unknown routed tool: ${name}`);
		}
		const parsed = await safeParseSurfaceArgs(record.inputSchema, args);
		if (!parsed.ok) {
			return {
				content: [{ type: 'text', text: parsed.message }],
				isError: true,
			};
		}
		const handler = record.handler as (
			...input: unknown[]
		) => Promise<unknown>;
		if (record.inputSchema === undefined) {
			return handler(extra);
		}
		return handler(parsed.value, extra);
	}

	publicDescriptionFor(
		registrationId: string,
		original: string | undefined,
		fallbackSummary: string | undefined,
	): string | undefined {
		const descriptor = this.plan.descriptors.find(
			(entry) => entry.registrationId === registrationId,
		);
		return compactDescription(
			original,
			descriptor?.summary ?? fallbackSummary,
		);
	}

	private setPluginState(
		identifier: string,
		active: boolean,
	): IPluginSurfaceChange | null {
		const plugin = this.pluginIndex.get(identifier);
		if (plugin === undefined) return null;
		const changedToolNames: string[] = [];
		const visibleToolNames: string[] = [];
		for (const registrationId of plugin.toolRegistrationIds) {
			const record = this.recordsByRegistrationId.get(registrationId);
			if (record === undefined) continue;
			if (active) {
				if (!record.handle.enabled) {
					record.handle.enable();
					changedToolNames.push(record.name);
				}
			} else if (record.handle.enabled) {
				record.handle.disable();
				changedToolNames.push(record.name);
			}
			if (record.handle.enabled) visibleToolNames.push(record.name);
		}
		return {
			pluginId: plugin.id,
			namespace: plugin.namespace,
			active,
			changedToolNames,
			visibleToolNames,
			...(changedToolNames.length === 0
				? { note: 'No visible surface change was needed.' }
				: {}),
		};
	}

	private shouldExpose(registrationId: string): boolean {
		if (this.mode === 'native') return true;
		if (this.plan.bootstrapToolIds.includes(registrationId)) return true;
		if (
			this.mode === 'compact' &&
			this.plan.routerToolId === registrationId
		) {
			return true;
		}
		return false;
	}
}

export const createToolSurfaceRuntime = (
	plan: IToolSurfacePlan,
): IToolSurfaceRuntime => new ToolSurfaceRuntime(plan);

export const createToolSurfaceRuntimeAccess = (): IToolSurfaceRuntimeAccess => {
	let runtime: IToolSurfaceRuntime | undefined;
	return {
		get: () => runtime,
		bind: (value) => {
			runtime = value;
		},
	};
};
