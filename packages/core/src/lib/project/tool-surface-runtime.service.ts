import type { RegisteredTool } from '@modelcontextprotocol/sdk/server/mcp.js';

import type { IKnowledgeEntry } from '../contracts/interfaces/knowledge.interface';
import type {
	IPluginSurfaceChange,
	IProjectContextSnapshot,
	IToolAccessState,
	IToolSurfacePlan,
	IToolSurfaceModeChange,
	IToolSurfaceRuntime,
	IToolSurfaceRuntimeAccess,
	IToolSurfaceSearchEntry,
	IToolSurfaceLazyBinding,
	IToolSurfaceWorkingSetPolicy,
} from '../contracts/interfaces/tool-surface.interface';
import {
	buildDryRunContractViolationResult,
	buildToolKnowledgeEntry,
	compactDescription,
	isToolAuthorized,
	isToolVisible,
	readDryRunFlag,
	safeParseSurfaceArgs,
	ToolNotAuthorizedError,
	withVisibilityIntent,
} from './tool-surface-runtime.helper';
import { TOOL_DETAILS_PREFIX } from '../contracts/constants/tool-details-prefix.constant';
import { enforceDryRunReturnContract } from '../dry-run/enforce';

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
	readonly handler?: unknown;
	readonly handle: {
		enabled: boolean;
		enable(): void;
		disable(): void;
	};
	/**
	 * Single source of truth for both visibility and authorization (see
	 * `IToolAccessState`). `handle.enabled` is kept as a synced projection
	 * of `isToolVisible(access)` purely so the underlying SDK `RegisteredTool`
	 * reflects the same visibility for `tools/list` — it is never read as
	 * an independent signal by this module's own logic any more.
	 */
	access: IToolAccessState;
	readonly lazyActivate?:
		| (() => Promise<IToolSurfaceLazyBinding>)
		| undefined;
}

/** Sync the SDK-facing handle to the record's canonical access state,
 * reporting whether the handle's visibility actually flipped. */
const syncHandleVisibility = (record: IBoundToolRecord): boolean => {
	const wantsVisible = isToolVisible(record.access);
	if (wantsVisible === record.handle.enabled) return false;
	if (wantsVisible) record.handle.enable();
	else record.handle.disable();
	return true;
};

const matchesFilter = (
	record: IBoundToolRecord,
	input: Parameters<IToolSurfaceRuntime['searchTools']>[0],
): boolean => {
	if (input?.activeOnly === true && !isToolVisible(record.access))
		return false;
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
	private readonly inFlightByPlugin = new Map<string, number>();
	private readonly loadedPluginIds = new Set<string>();
	private readonly workingSetPolicy: IToolSurfaceWorkingSetPolicy;
	private lazyPluginLoader: ((pluginId: string) => Promise<void>) | undefined;

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
			// Mirror the handle's incoming visibility until the surface mode
			// is (re)applied; every bound tool starts authorized.
			access: input.handle.enabled ? 'visible' : 'hidden',
		};
		this.recordsByName.set(record.name, record);
		this.recordsByRegistrationId.set(record.registrationId, record);
		if (record.pluginId !== undefined)
			this.loadedPluginIds.add(record.pluginId);
	}

	bindLazyTool(input: {
		readonly registrationId: string;
		readonly activate: () => Promise<IToolSurfaceLazyBinding>;
	}): void {
		const descriptor = this.plan.descriptors.find(
			(entry) => entry.registrationId === input.registrationId,
		);
		if (descriptor === undefined) return;
		const handle = {
			enabled: false,
			enable() {
				this.enabled = true;
			},
			disable() {
				this.enabled = false;
			},
		};
		const record: IBoundToolRecord = {
			...descriptor,
			detailsId: `${TOOL_DETAILS_PREFIX}${descriptor.name}`,
			handle: handle,
			access: 'hidden',
			lazyActivate: input.activate,
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
			const wantsVisible = this.shouldExpose(record.registrationId, mode);
			// A deactivated tool's `access` is left untouched here — a
			// surface-mode change is a visibility intent only, and can
			// never re-authorize a deactivated tool.
			record.access = withVisibilityIntent(record.access, wantsVisible);
			if (syncHandleVisibility(record))
				changedToolNames.push(record.name);
			if (isToolVisible(record.access))
				visibleToolNames.push(record.name);
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
		const record = this.recordsByName.get(name);
		return record === undefined ? true : isToolVisible(record.access);
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
				active: isToolVisible(record.access),
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

	setLazyPluginLoader(loader: (pluginId: string) => Promise<void>): void {
		this.lazyPluginLoader = loader;
	}

	async activatePluginAsync(
		identifier: string,
	): Promise<IPluginSurfaceChange | null> {
		const plugin = this.pluginIndex.get(identifier);
		if (plugin === undefined) return null;
		await this.lazyPluginLoader?.(plugin.id);
		return this.activatePlugin(identifier);
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
			(record) => isToolVisible(record.access),
		).length;
		const visibleDomains = [
			...new Set(
				[...this.recordsByName.values()]
					.filter((record) => isToolVisible(record.access))
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
			loadedPlugins: [...this.loadedPluginIds].sort(),
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
			active: isToolVisible(found.access),
			detailsId: found.detailsId,
		};
	}

	async invokeTool(
		name: string,
		args: unknown,
		extra: unknown,
	): Promise<unknown> {
		let record = this.recordsByName.get(name);
		if (record === undefined) {
			throw new Error(`Unknown routed tool: ${name}`);
		}
		// Authorization is checked before any dispatch work (lazy activation,
		// plugin warming, arg parsing): a deactivated tool must never run,
		// whether or not it is currently visible in tools/list.
		if (!isToolAuthorized(record.access)) {
			throw new ToolNotAuthorizedError(name);
		}
		if (record.handler === undefined && record.lazyActivate !== undefined) {
			const binding = await record.lazyActivate();
			record = this.recordsByRegistrationId.get(
				record.registrationId,
			) ?? {
				...record,
				...binding,
				lazyActivate: undefined,
			};
			this.recordsByName.set(record.name, record);
			this.recordsByRegistrationId.set(record.registrationId, record);
			if (record.pluginId !== undefined)
				this.loadedPluginIds.add(record.pluginId);
		}
		const pluginId = record.pluginId;
		if (pluginId !== undefined) {
			this.inFlightByPlugin.set(
				pluginId,
				(this.inFlightByPlugin.get(pluginId) ?? 0) + 1,
			);
		}
		try {
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
			const result =
				record.inputSchema === undefined
					? await handler(extra)
					: await handler(parsed.value, extra);
			return this.applyDryRunContract(name, args, result);
		} finally {
			if (pluginId !== undefined) {
				const remaining =
					(this.inFlightByPlugin.get(pluginId) ?? 1) - 1;
				if (remaining > 0)
					this.inFlightByPlugin.set(pluginId, remaining);
				else this.inFlightByPlugin.delete(pluginId);
			}
		}
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
			// `plugin_activate` / `plugin_deactivate` drive AUTHORIZATION, not
			// just visibility: deactivating forces `deactivated` (hidden AND
			// refused by invokeTool); activating restores full `visible`
			// access, overriding whatever the current surface mode would
			// otherwise compute — an explicit activation is a stronger
			// signal than the ambient mode.
			record.access = active ? 'visible' : 'deactivated';
			if (syncHandleVisibility(record))
				changedToolNames.push(record.name);
			if (isToolVisible(record.access))
				visibleToolNames.push(record.name);
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
				if ((this.inFlightByPlugin.get(pluginId) ?? 0) > 0) continue;
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

	/**
	 * Router-side dry-run enforcement (f00189): the ONE place a plugin
	 * handler's return value is inspected before it reaches the caller.
	 * When `args.dryRun !== true` this is a no-op passthrough. When
	 * `args.dryRun === true` and the handler ignored that flag (or
	 * returned a malformed plan), the caller gets a typed tool-error
	 * result instead of the bogus "I did the dry run" payload — this is
	 * DETECTION (the handler already ran), not prevention; see
	 * `dry-run/effect-guard.ts` for the prevention-side primitive and
	 * why it cannot be made mandatory from this module alone.
	 */
	private applyDryRunContract(
		name: string,
		args: unknown,
		result: unknown,
	): unknown {
		const verdict = enforceDryRunReturnContract({
			args: { dryRun: readDryRunFlag(args) },
			result,
		});
		if (verdict.kind === 'forwarded') return verdict.value;
		return buildDryRunContractViolationResult(name, verdict);
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
