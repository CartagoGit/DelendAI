import type { RegisteredTool } from '@modelcontextprotocol/sdk/server/mcp.js';

import type { IKnowledgeEntry } from '../contracts/interfaces/knowledge.interface';
import type {
	IPluginSurfaceChange,
	IProjectContextSnapshot,
	IToolSurfacePlan,
	IToolSurfaceModeChange,
	IToolSurfaceRuntime,
	IToolSurfaceRuntimeAccess,
	IToolSurfaceSearchEntry,
	IToolSurfaceWorkingSetPolicy,
} from '../contracts/interfaces/tool-surface.interface';
import {
	buildToolKnowledgeEntry,
	compactDescription,
	safeParseSurfaceArgs,
} from './tool-surface-runtime.helper';
import { TOOL_DETAILS_PREFIX } from '../contracts/constants/tool-details-prefix.constant';

const DEFAULT_SEARCH_LIMIT = 20;
const DEFAULT_WORKING_SET_POLICY = {
	idleTtlMs: 5 * 60_000,
	maxWarmPlugins: 8,
} as const;

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
	private currentMode;

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
	private readonly warmAtByPlugin = new Map<string, number>();
	private readonly workingSetPolicy: IToolSurfaceWorkingSetPolicy;

	constructor(private readonly plan: IToolSurfacePlan) {
		this.workingSetPolicy = plan.workingSet ?? DEFAULT_WORKING_SET_POLICY;
		this.currentMode = plan.mode;
		for (const plugin of plan.plugins) {
			this.pluginIndex.set(plugin.id, plugin);
			this.pluginIndex.set(plugin.namespace, plugin);
		}
	}

	get mode() {
		return this.currentMode;
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
		this.applySurfaceMode(this.currentMode);
		if (this.currentMode === 'native') {
			const now = Date.now();
			for (const plugin of this.plan.plugins) {
				this.warmAtByPlugin.set(plugin.id, now);
			}
		}
	}

	applySurfaceMode(mode: IToolSurfacePlan['mode']): IToolSurfaceModeChange {
		const changedToolNames: string[] = [];
		const visibleToolNames: string[] = [];
		const previousMode = this.currentMode;
		for (const record of this.recordsByName.values()) {
			const shouldExpose = this.shouldExpose(record.registrationId, mode);
			if (shouldExpose) {
				if (!record.handle.enabled) {
					record.handle.enable();
					changedToolNames.push(record.name);
				}
				visibleToolNames.push(record.name);
				continue;
			}
			if (record.handle.enabled) {
				record.handle.disable();
				changedToolNames.push(record.name);
			}
		}
		this.currentMode = mode;
		return {
			previousMode,
			mode,
			changedToolNames,
			visibleToolNames,
		};
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

	measureSchemaBytes(
		mode: IToolSurfacePlan['mode'],
	): Readonly<Record<string, number>> {
		const result: Record<string, number> = {};
		for (const record of this.recordsByName.values()) {
			if (!this.shouldExpose(record.registrationId, mode)) continue;
			const inputSchema = toJsonSchema(record.inputSchema) ?? {
				type: 'object',
				properties: {},
			};
			const definition: Record<string, unknown> = {
				name: record.name,
				description: compactDescription(
					record.description,
					record.summary,
				),
				inputSchema,
			};
			const outputSchema = toJsonSchema(record.outputSchema);
			if (outputSchema !== undefined)
				definition.outputSchema = outputSchema;
			result[record.registrationId] = Buffer.byteLength(
				JSON.stringify(definition),
				'utf8',
			);
		}
		return result;
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
		this.evictIdlePlugins();
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
			surfaceMode: this.currentMode,
			workspaceRoot: input.workspaceRoot,
			...(input.cacheDir !== undefined
				? { cacheDir: input.cacheDir }
				: {}),
			...(input.docsDir !== undefined ? { docsDir: input.docsDir } : {}),
			configIssues: [...(input.configIssues ?? [])],
			loadedPlugins: [
				...new Set(this.plan.plugins.map((plugin) => plugin.id)),
			].sort(),
			warmPlugins: [...this.warmAtByPlugin.keys()].sort(),
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
		this.touchPlugin(found);
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
		this.touchPlugin(record);
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
		if (active) this.warmAtByPlugin.set(plugin.id, Date.now());
		else this.warmAtByPlugin.delete(plugin.id);
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

	evictIdlePlugins(nowMs = Date.now()): readonly string[] {
		const evicted: string[] = [];
		const ttl = this.workingSetPolicy.idleTtlMs;
		if (ttl !== null) {
			for (const [pluginId, touchedAt] of this.warmAtByPlugin) {
				if (nowMs - touchedAt >= ttl) {
					this.warmAtByPlugin.delete(pluginId);
					evicted.push(pluginId);
				}
			}
		}
		const max = this.workingSetPolicy.maxWarmPlugins;
		if (max !== null && this.warmAtByPlugin.size > max) {
			const oldest = [...this.warmAtByPlugin.entries()]
				.sort((a, b) => a[1] - b[1])
				.slice(0, this.warmAtByPlugin.size - max);
			for (const [pluginId] of oldest) {
				this.warmAtByPlugin.delete(pluginId);
				if (!evicted.includes(pluginId)) evicted.push(pluginId);
			}
		}
		return evicted;
	}

	private touchPlugin(record: IBoundToolRecord): void {
		if (record.pluginId === undefined) return;
		this.warmAtByPlugin.set(record.pluginId, Date.now());
		this.evictIdlePlugins();
	}

	private shouldExpose(
		registrationId: string,
		mode: IToolSurfacePlan['mode'],
	): boolean {
		if (mode === 'native') {
			return this.plan.routerToolId !== registrationId;
		}
		if (this.plan.bootstrapToolIds.includes(registrationId)) return true;
		if (mode === 'compact' && this.plan.routerToolId === registrationId) {
			return true;
		}
		return false;
	}
}

/** Convert Zod 4 schemas to the JSON shape sent over MCP. Raw shapes and
 * already-serialisable schemas are retained as-is for compatibility with
 * programmatic hosts. */
const toJsonSchema = (schema: unknown): unknown => {
	if (schema === undefined) return undefined;
	if (
		typeof schema === 'object' &&
		schema !== null &&
		'toJSONSchema' in schema &&
		typeof schema.toJSONSchema === 'function'
	) {
		try {
			return schema.toJSONSchema();
		} catch {
			return schema;
		}
	}
	return schema;
};

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
