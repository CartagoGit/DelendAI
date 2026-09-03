import type { RegisteredTool } from '@modelcontextprotocol/sdk/server/mcp.js';

import type { IKnowledgeEntry } from '../contracts/interfaces/knowledge.interface';
import type {
	IPluginSurfaceChange,
	IProjectContextSnapshot,
	IToolAccessState,
	IToolExposureState,
	IToolSurfaceDescriptor,
	IToolSurfacePlan,
	IToolSurfaceModeChange,
	IToolSurfacePluginEvictedEvent,
	IToolSurfaceRuntime,
	IToolSurfaceRuntimeAccess,
	IToolSurfaceSearchEntry,
	IToolSurfaceLazyBinding,
	IToolSurfaceWorkingSetPolicy,
	ISurfaceListChangeBatcher,
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
import { measureToolWireBytes } from '../surface/bootstrap';
import { enforceDryRunReturnContract } from '../dry-run/enforce';
import { runWithDryRunScope } from '../dry-run/dry-run-scope.helper';
import { recordDryRunViolation } from '../dry-run/dry-run-violation-log.service';

const DEFAULT_SEARCH_LIMIT = 20;
const SEARCH_SCORE = {
	exactToolId: 100,
	namePrefix: 80,
	tagExact: 60,
	summarySubstring: 30,
} as const;
const DEFAULT_WORKING_SET_POLICY = {
	idleTtlMs: 5 * 60_000,
	maxWarmPlugins: 8,
} as const;

const warnUnknownToolExposure = (name: string): void => {
	process.stderr.write(
		`[surface] warn: unknown tool exposure lookup for "${name}"\n`,
	);
};

interface IBoundToolRecord {
	readonly registrationId: string;
	readonly name: string;
	readonly toolId: string;
	readonly pluginId?: string | undefined;
	readonly namespace?: string | undefined;
	readonly summary?: string | undefined;
	readonly tags?: readonly string[] | undefined;
	/** See `IToolSurfaceDescriptor.disclosure`. */
	readonly disclosure?: IToolSurfaceDescriptor['disclosure'];
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
	const needle = input.query.trim().toLowerCase();
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

const scoreCandidate = (
	record: IBoundToolRecord,
	query: string | undefined,
): number => {
	if (query === undefined) return 0;
	const needle = query.trim().toLowerCase();
	if (needle.length === 0) return 0;

	let score = 0;
	if (record.toolId.toLowerCase() === needle) {
		score = SEARCH_SCORE.exactToolId;
	}
	if (record.name.toLowerCase().startsWith(needle)) {
		score = Math.max(score, SEARCH_SCORE.namePrefix);
	}
	if ((record.tags ?? []).some((tag) => tag.toLowerCase() === needle)) {
		score = Math.max(score, SEARCH_SCORE.tagExact);
	}
	if (record.summary?.toLowerCase().includes(needle) === true) {
		score = Math.max(score, SEARCH_SCORE.summarySubstring);
	}
	return score;
};

const comparePortableStrings = (left: string, right: string): number => {
	if (left === right) return 0;
	return left < right ? -1 : 1;
};

const compareSearchCandidates = (
	left: { readonly record: IBoundToolRecord; readonly score: number },
	right: { readonly record: IBoundToolRecord; readonly score: number },
): number => {
	if (left.score !== right.score) return right.score - left.score;
	const nameOrder = comparePortableStrings(
		left.record.name,
		right.record.name,
	);
	if (nameOrder !== 0) return nameOrder;
	return comparePortableStrings(
		left.record.registrationId,
		right.record.registrationId,
	);
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
	private listChangeBatcher: ISurfaceListChangeBatcher | undefined;
	/**
	 * Every `bindLazyTool` activator ever handed to this runtime, keyed
	 * by registrationId, retained FOREVER — even once the tool
	 * materializes into a real handler via `bindRegisteredTool`. This is
	 * the "way back" eviction needs: `rebindPluginAsLazy` (x00286) looks
	 * a plugin's tools up here to hand `invokeTool` a fresh
	 * `lazyActivate` after the live handler is torn down. A plugin whose
	 * tools were bound only through `bindRegisteredTool` (never lazy to
	 * begin with) has no entry here — `isPluginEvictable` uses that
	 * absence to refuse evicting it, since there would be no way back.
	 */
	private readonly lazyActivatorsByRegistrationId = new Map<
		string,
		() => Promise<IToolSurfaceLazyBinding>
	>();
	/** Injected via `setPluginDisposer` (x00286); absent by default. */
	private pluginDisposer: ((pluginId: string) => Promise<void>) | undefined;
	/**
	 * One entry per plugin currently being disposed/relazied by
	 * `scheduleDisposal`. `invokeTool` awaits the matching entry before
	 * deciding whether a tool needs reactivating, so a call that lands
	 * mid-eviction never observes the half-transitioned state (dispose
	 * settled but relazy not yet applied) and never triggers a second,
	 * concurrent disposal of the same plugin.
	 */
	private readonly disposalsInFlight = new Map<string, Promise<void>>();
	private readonly pluginEvictedListeners = new Set<
		(event: IToolSurfacePluginEvictedEvent) => void
	>();

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
		this.lazyActivatorsByRegistrationId.set(
			input.registrationId,
			input.activate,
		);
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
			const wantsVisible = this.shouldExpose(record, mode);
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

	async applySurfaceModeAsync(
		mode: IToolSurfacePlan['mode'],
	): Promise<IToolSurfaceModeChange> {
		// Only `native` needs this: it is the one mode whose compatibility
		// promise is "every ordinary tool up front". Registrations that opt
		// into progressive disclosure remain router-discoverable instead. A
		// plugin still sitting behind `bindLazyTool`'s fake handle has no
		// real SDK `RegisteredTool` yet, so `applySurfaceMode` flipping
		// `access` to `visible` changes nothing an unrecognised client can
		// see. Materialize every plugin that has not loaded yet (through
		// whatever `setLazyPluginLoader` was wired to) before computing
		// visibility. managed/adaptive/compact never reach this branch —
		// their entire design is NOT loading everything, and this must not
		// undo that.
		const loader = this.lazyPluginLoader;
		if (mode === 'native' && loader !== undefined) {
			const pending = this.plan.plugins.filter(
				(plugin) => !this.loadedPluginIds.has(plugin.id),
			);
			await Promise.all(
				pending.map((plugin) =>
					loader(plugin.id).catch(() => undefined),
				),
			);
		}
		return this.applySurfaceMode(mode);
	}

	getToolExposure(name: string): IToolExposureState {
		const record = this.recordsByName.get(name);
		if (record === undefined) {
			warnUnknownToolExposure(name);
			return 'unknown';
		}
		return isToolVisible(record.access) ? 'visible' : 'hidden';
	}

	isToolExposed(name: string): boolean {
		return this.getToolExposure(name) === 'visible';
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
		const query = input?.query;
		return [...this.recordsByName.values()]
			.filter((record) => matchesFilter(record, input))
			.map((record) => ({ record, score: scoreCandidate(record, query) }))
			.sort(compareSearchCandidates)
			.slice(0, limit)
			.map(({ record }) => ({
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

	/**
	 * Per-tool wire bytes for every record visible in `mode`, keyed by
	 * registration id. Delegates to the shared `measureToolWireBytes`
	 * (AUD-B04 / x00284) with the record's RAW `description` — not the
	 * `compactDescription`-truncated summary this used before, which no
	 * real `tools/list` response ever sends (that compaction only
	 * applies to the `overview`/`tool_search` display projection, never
	 * to what a live `server.registerTool()` call actually registers).
	 */
	measureSchemaBytes(
		mode: IToolSurfacePlan['mode'],
	): Readonly<Record<string, number>> {
		const result: Record<string, number> = {};
		for (const record of this.recordsByName.values()) {
			if (!this.shouldExpose(record, mode)) continue;
			result[record.registrationId] = measureToolWireBytes({
				name: record.name,
				description: record.description,
				inputSchema: toJsonSchema(record.inputSchema),
				outputSchema: toJsonSchema(record.outputSchema),
				// Every tool this codebase registers goes through the
				// standard `server.registerTool(name, config, handler)`
				// overload, which the MCP SDK hardcodes to
				// `execution: {taskSupport: 'forbidden'}` (never left
				// `undefined`) — a real, constant contributor to wire
				// bytes that a projected measurement must include too.
				execution: { taskSupport: 'forbidden' },
			});
		}
		return result;
	}

	activatePlugin(identifier: string): IPluginSurfaceChange | null {
		const activate = () => this.setPluginState(identifier, true);
		return this.listChangeBatcher?.batchSync(activate) ?? activate();
	}

	setLazyPluginLoader(loader: (pluginId: string) => Promise<void>): void {
		this.lazyPluginLoader = loader;
	}

	setListChangeBatcher(batcher: ISurfaceListChangeBatcher): void {
		this.listChangeBatcher = batcher;
	}

	setPluginDisposer(disposer: (pluginId: string) => Promise<void>): void {
		this.pluginDisposer = disposer;
	}

	onPluginEvicted(
		listener: (event: IToolSurfacePluginEvictedEvent) => void,
	): () => void {
		this.pluginEvictedListeners.add(listener);
		return () => this.pluginEvictedListeners.delete(listener);
	}

	async activatePluginAsync(
		identifier: string,
	): Promise<IPluginSurfaceChange | null> {
		const plugin = this.pluginIndex.get(identifier);
		if (plugin === undefined) return null;
		const activate = async () => {
			await this.lazyPluginLoader?.(plugin.id);
			return this.activatePlugin(identifier);
		};
		return this.listChangeBatcher?.batch(activate) ?? activate();
	}

	deactivatePlugin(identifier: string): IPluginSurfaceChange | null {
		const deactivate = () => this.setPluginState(identifier, false);
		return this.listChangeBatcher?.batchSync(deactivate) ?? deactivate();
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
		// A call that lands while its plugin is mid-eviction must wait for
		// that transition to finish (dispose settled, tools relazied)
		// before deciding whether to reactivate — otherwise it could read
		// a handler that is about to be torn out from under it, or race
		// `scheduleDisposal` into disposing the very plugin it just used.
		if (record.pluginId !== undefined) {
			const disposal = this.disposalsInFlight.get(record.pluginId);
			if (disposal !== undefined) {
				await disposal;
				record = this.recordsByName.get(name) ?? record;
			}
		}
		if (record.handler === undefined && record.lazyActivate !== undefined) {
			const beforeActivate = record;
			const binding = await record.lazyActivate();
			// `activate()` (usually `materializeLazyTool` from
			// `create-mcp-project.ts`) normally calls `bindRegisteredTool`
			// itself as a side effect, which is why a concurrently-raced
			// activation shows up here as a DIFFERENT object already in
			// the map — prefer that. But `activate()` can also be a raw
			// activator with no such side effect (every retained
			// `bindLazyTool` closure `rebindPluginAsLazy` (x00286) hands
			// back after an eviction is exactly this: calling it again
			// just returns the same cached binding, it does not
			// re-register anything) — in that case the map still holds
			// the SAME stale, handler-less record we started with, and
			// the returned `binding` is the only place the real handler
			// exists. Only trust the map's current entry when it changed
			// out from under us; otherwise build the merged record from
			// `binding` ourselves.
			const concurrentlyUpdated = this.recordsByRegistrationId.get(
				record.registrationId,
			);
			record =
				concurrentlyUpdated !== undefined &&
				concurrentlyUpdated !== beforeActivate
					? concurrentlyUpdated
					: {
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
			this.plan.activationKpis?.recordInvocation(record.toolId);
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
			// Open the ambient dry-run scope BEFORE the
			// handler runs, seeded from THIS call's `args.dryRun`. Any
			// capability the plugin obtained from `ctx.effects` (built once
			// at register time) reads that ambient flag on every
			// invocation, so a handler that never checks `args.dryRun`
			// still cannot reach a real effect while it is true — see
			// `dry-run/dry-run-scope.helper.ts`.
			const result = await runWithDryRunScope(
				readDryRunFlag(args) === true,
				async () =>
					record.inputSchema === undefined
						? await handler(extra)
						: await handler(parsed.value, extra),
			);
			return this.applyDryRunContract(name, pluginId, args, result);
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
			// `plugin_activate` / `plugin_deactivate` drive AUTHORIZATION,
			// and an explicit activation stays a stronger signal than the
			// ambient mode: it restores full `visible` access even in a mode
			// that would otherwise list nothing. The one exception is a host
			// that opted into progressive disclosure, where a
			// contextual/administrative tool stays routable rather than
			// returning to `tools/list` as a side effect of activation.
			record.access = active
				? this.plan.progressiveDisclosure === true &&
					(record.disclosure === 'contextual' ||
						record.disclosure === 'administrative')
					? 'hidden'
					: 'visible'
				: 'deactivated';
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

	/**
	 * True only if EVERY tool registration this plugin owns still has a
	 * retained `bindLazyTool` activator to fall back to. A plugin whose
	 * tools were bound solely through `bindRegisteredTool` (never lazy to
	 * begin with — the case every existing unit-test fixture in this file
	 * that skips `bindLazyTool` hits) has no way back: evicting it would
	 * leave `invokeTool` with a live `handler === undefined` and nothing
	 * to reactivate it with. Deliberately conservative — this never fakes
	 * an eviction that would break the plugin's next invocation.
	 */
	private isPluginEvictable(pluginId: string): boolean {
		const plugin = this.pluginIndex.get(pluginId);
		if (plugin === undefined) return false;
		return plugin.toolRegistrationIds.every((registrationId) =>
			this.lazyActivatorsByRegistrationId.has(registrationId),
		);
	}

	/**
	 * Flip a plugin's tools back to their pre-activation shape: no live
	 * handler, `lazyActivate` restored from the permanent registry built
	 * in `bindLazyTool`. Metadata (`inputSchema`/`outputSchema`/
	 * `description`) and `access` (visible/hidden/deactivated) are left
	 * untouched — eviction changes internal dispatch, never the
	 * visible/hidden/deactivated contract (a plugin that was `visible`
	 * stays `visible` in `tools/list`; only the next call through it pays
	 * the reactivation cost). `loadedPluginIds` drops the plugin so
	 * `project_context.loadedPlugins` stops claiming it is still resident.
	 */
	private rebindPluginAsLazy(pluginId: string): void {
		const plugin = this.pluginIndex.get(pluginId);
		if (plugin === undefined) return;
		for (const registrationId of plugin.toolRegistrationIds) {
			const record = this.recordsByRegistrationId.get(registrationId);
			const activate =
				this.lazyActivatorsByRegistrationId.get(registrationId);
			if (record === undefined || activate === undefined) continue;
			const relazied: IBoundToolRecord = {
				...record,
				handler: undefined,
				lazyActivate: activate,
			};
			this.recordsByName.set(relazied.name, relazied);
			this.recordsByRegistrationId.set(relazied.registrationId, relazied);
		}
		this.loadedPluginIds.delete(pluginId);
	}

	/**
	 * Run the real teardown for one evicted plugin: best-effort
	 * `pluginDisposer` (absent by default — see `setPluginDisposer`),
	 * then unconditional relazy, then the observable side of this fix —
	 * a stderr line plus every `onPluginEvicted` listener — regardless of
	 * whether disposal succeeded. A throwing disposer is caught and
	 * reported via `disposeError` on the event; it never blocks the
	 * relazy or any other plugin's disposal (same aggregate-not-throw
	 * shape as `IManagedLazyRuntime.disposeAll()` from r00038). Guarded
	 * against re-entry per plugin via `disposalsInFlight` — `evictIdlePlugins`
	 * cannot select an already-evicted plugin again (it is no longer in
	 * `warmAtByPlugin`), but this guard also protects a caller invoking
	 * this method directly in a test.
	 */
	private scheduleDisposal(
		pluginId: string,
		reason: 'idle-ttl' | 'max-warm-plugins',
	): void {
		if (this.disposalsInFlight.has(pluginId)) return;
		const plugin = this.pluginIndex.get(pluginId);
		const namespace = plugin?.namespace ?? pluginId;
		const task = (async () => {
			let disposeError: unknown;
			try {
				await this.pluginDisposer?.(pluginId);
			} catch (error) {
				disposeError = error;
			}
			this.rebindPluginAsLazy(pluginId);
			const event: IToolSurfacePluginEvictedEvent = {
				pluginId,
				namespace,
				reason,
				...(disposeError !== undefined ? { disposeError } : {}),
			};
			if (disposeError !== undefined) {
				process.stderr.write(
					`[surface] evicted plugin "${namespace}" (${reason}) — dispose failed, relazied anyway\n`,
				);
			}
			for (const listener of this.pluginEvictedListeners) {
				listener(event);
			}
		})();
		this.disposalsInFlight.set(pluginId, task);
		void task.finally(() => {
			if (this.disposalsInFlight.get(pluginId) === task) {
				this.disposalsInFlight.delete(pluginId);
			}
		});
	}

	evictIdlePlugins(nowMs = Date.now()): readonly string[] {
		const evicted: string[] = [];
		const reasonByPluginId = new Map<
			string,
			'idle-ttl' | 'max-warm-plugins'
		>();
		const ttl = this.workingSetPolicy.idleTtlMs;
		if (ttl !== null) {
			for (const [pluginId, touchedAt] of this.warmAtByPlugin) {
				if ((this.inFlightByPlugin.get(pluginId) ?? 0) > 0) continue;
				if (!this.isPluginEvictable(pluginId)) continue;
				if (nowMs - touchedAt >= ttl) {
					this.warmAtByPlugin.delete(pluginId);
					evicted.push(pluginId);
					reasonByPluginId.set(pluginId, 'idle-ttl');
				}
			}
		}
		const max = this.workingSetPolicy.maxWarmPlugins;
		if (max !== null && this.warmAtByPlugin.size > max) {
			// The LRU branch used to select "the oldest N over budget" with
			// no in-flight guard at all — a plugin mid-invocation could be
			// the globally oldest touch and get evicted out from under its
			// own call. Filter to eviction-safe candidates FIRST, then take
			// the oldest among those; if fewer safe candidates exist than
			// the overage, the working set stays over budget rather than
			// evicting something it cannot safely evict.
			const candidates = [...this.warmAtByPlugin.entries()]
				.filter(
					([pluginId]) =>
						(this.inFlightByPlugin.get(pluginId) ?? 0) === 0 &&
						this.isPluginEvictable(pluginId),
				)
				.sort((a, b) => a[1] - b[1])
				.slice(0, this.warmAtByPlugin.size - max);
			for (const [pluginId] of candidates) {
				this.warmAtByPlugin.delete(pluginId);
				if (!evicted.includes(pluginId)) evicted.push(pluginId);
				if (!reasonByPluginId.has(pluginId)) {
					reasonByPluginId.set(pluginId, 'max-warm-plugins');
				}
			}
		}
		for (const pluginId of evicted) {
			this.scheduleDisposal(
				pluginId,
				reasonByPluginId.get(pluginId) ?? 'max-warm-plugins',
			);
		}
		return evicted;
	}

	hasInFlightWork(): boolean {
		return this.inFlightByPlugin.size > 0;
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
	 * `dry-run/effect-guard.helper.ts` for the prevention-side primitive and
	 * why it cannot be made mandatory from this module alone.
	 */
	private applyDryRunContract(
		name: string,
		pluginId: string | undefined,
		args: unknown,
		result: unknown,
	): unknown {
		const verdict = enforceDryRunReturnContract({
			args: { dryRun: readDryRunFlag(args) },
			result,
		});
		if (verdict.kind === 'forwarded') return verdict.value;
		// S1 (r00037): DETECTION already happened — the handler ran to
		// completion before this line — but the violation is no longer
		// silent: it is recorded with the plugin/tool responsible so a
		// host can turn `listDryRunViolations()` into measurable
		// migration pressure. Prevention (making the effect itself
		// impossible) is the EffectBroker, not this log.
		recordDryRunViolation({
			ts: new Date().toISOString(),
			tool: name,
			pluginId,
			reason: verdict.reason,
			issues: verdict.issues,
		});
		return buildDryRunContractViolationResult(name, verdict);
	}

	private shouldExpose(
		record: IBoundToolRecord,
		mode: IToolSurfacePlan['mode'],
	): boolean {
		const registrationId = record.registrationId;
		if (mode === 'native') {
			// A native host that has not opted into progressive disclosure
			// keeps the mode's documented promise: every ordinary tool
			// listed, the router hidden, and every tool callable by name.
			if (this.plan.progressiveDisclosure !== true) {
				return this.plan.routerToolId !== registrationId;
			}
			// Native normally does not need the compact router because it
			// lists every ordinary tool. Once the host opts into progressive
			// disclosure, the router is the stable invocation path for
			// intentionally hidden tools and must remain visible.
			if (this.plan.routerToolId === registrationId) {
				return this.hasProgressivelyHiddenTools();
			}
			// A registration that opts into progressive
			// disclosure (`contextual`/`administrative`) is left off the
			// static `native` `tools/list`, but nothing else about it
			// changes — it stays authorized and reachable through
			// `invokeTool`/`resolveRoute`/`searchTools` (the `hidden`
			// access state). Omitted or `'essential'` behaves exactly as
			// before this field existed: always listed.
			if (
				record.disclosure === 'contextual' ||
				record.disclosure === 'administrative'
			) {
				return false;
			}
			return true;
		}
		if (this.plan.bootstrapToolIds.includes(registrationId)) return true;
		if (mode === 'compact' && this.plan.routerToolId === registrationId) {
			return true;
		}
		return false;
	}

	private hasProgressivelyHiddenTools(): boolean {
		for (const record of this.recordsByName.values()) {
			if (
				record.disclosure === 'contextual' ||
				record.disclosure === 'administrative'
			) {
				return true;
			}
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
