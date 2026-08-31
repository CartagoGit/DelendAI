import type { McpStdioClient } from '../transport/mcp-stdio-client';
import type {
	IOverview,
	IOverviewTool,
	IToolDescriptor,
	IToolEffect,
} from '../contracts/interfaces/tool-descriptor.interface';
import { formatToolName } from './_namespace';

/** Compact overview tool — the {plugin: stems[]} projection. */
type ICompactToolsGroup = Record<string, readonly string[]>;

/**
 * Normalise an `overview.tools` payload into flat tool descriptors,
 * accepting BOTH shapes the tool can return:
 *   - full overview: an array of per-tool entries (string | object);
 *   - compact overview: a record grouped by plugin
 *     (`{ proposals: ['agent_lock', …], core: ['overview', …] }`), where
 *     each entry is the unqualified stem and the full callable name is
 *     `<namespacePrefix>_<plugin>_<stem>` (core: `<namespacePrefix>_<stem>`).
 *
 * The grouped form carries the plugin explicitly (as the group key), so
 * it is MORE reliable than parsing the plugin out of a flat name. The
 * `core` group represents host-level bootstrap tools — they keep the
 * canonical plugin id `core` (not the host namespace) so the UI groups
 * them under a stable label rather than the deployment prefix.
 */
export const normalizeCompactTools = (
	tools: IOverview['tools'],
	namespacePrefix: string,
): IToolDescriptor[] => {
	if (Array.isArray(tools)) {
		return tools.map((tool) => normalizeTool(tool));
	}
	const groups = tools as ICompactToolsGroup;
	const out: IToolDescriptor[] = [];
	for (const [group, stems] of Object.entries(groups)) {
		for (const stem of stems) {
			const name =
				group === 'core'
					? `${namespacePrefix}_${stem}`
					: `${namespacePrefix}_${group}_${stem}`;
			out.push({
				name,
				plugin: group === 'core' ? 'core' : group,
				tags: [],
				effects: [],
			});
		}
	}
	return out;
};

/**
 * Shape returned by `mcp-vertex_tool_search`. We re-declare it here
 * (instead of importing the runtime schema) to keep the client free of
 * server-side zod types.
 */
export interface IToolSearchEntry {
	readonly registrationId: string;
	readonly name: string;
	readonly toolId: string;
	readonly pluginId?: string;
	readonly namespace?: string;
	readonly summary?: string;
	readonly tags?: readonly string[];
	readonly active: boolean;
	readonly detailsId: string;
}

/**
 * Enumerate every tool the server knows about (including lazy ones)
 * by calling `mcp-vertex_tool_search` with a high limit. This is the
 * canonical source for tree-style UIs that want to show all available
 * tools grouped by plugin — `overview.tools` only carries the visible
 * (bootstrap) surface, not the lazy 220+ behind it.
 */
export const normalizeToolSearchEntries = (
	entries: readonly IToolSearchEntry[],
): IToolDescriptor[] =>
	entries.map((entry) => ({
		name: entry.name,
		plugin: entry.namespace ?? entry.pluginId ?? 'core',
		...(entry.summary === undefined ? {} : { summary: entry.summary }),
		tags: [...(entry.tags ?? [])],
		effects: [],
		loaded: entry.active,
	}));

export interface IOverviewOptions {
	readonly compact?: boolean;
	readonly tag?: string;
}

export class OverviewService {
	private readonly namespacePrefix: string | undefined;

	constructor(
		private readonly client: McpStdioClient,
		namespacePrefix?: string,
	) {
		this.namespacePrefix = namespacePrefix;
	}

	async getOverview(options: IOverviewOptions = {}): Promise<IOverview> {
		return this.client.request<IOverviewOptions, IOverview>(
			formatToolName(this.namespacePrefix, 'overview'),
			options,
		);
	}

	async listTools(): Promise<readonly IToolDescriptor[]> {
		// The compact overview only enumerates the bootstrap surface
		// (six tools). For UIs that want every tool — lazy, eager, hidden
		// — fall back to `tool_search`, which exposes the full registry
		// keyed by `<prefix>_<plugin>_<stem>` (or `<prefix>_<stem>` for
		// host bootstrap tools) and includes the plugin namespace. We
		// silently fall back to the compact projection when `tool_search`
		// is not exposed, so status-bar style consumers still work.
		try {
			const result = await this.client.request<
				{ readonly limit?: number },
				{ readonly entries: readonly IToolSearchEntry[] }
			>(formatToolName(this.namespacePrefix, 'tool_search'), {
				limit: 100,
			});
			if (result.entries.length > 0) {
				return normalizeToolSearchEntries(result.entries);
			}
		} catch {
			// tool_search not exposed on this surface (e.g. compact mode
			// without the lazy plumbing): fall through to the overview.
		}
		const overview = await this.getOverview({ compact: true });
		return normalizeCompactTools(overview.tools, overview.namespacePrefix);
	}
}

export const normalizeTool = (tool: IOverviewTool): IToolDescriptor => {
	if (typeof tool === 'string') {
		return {
			name: tool,
			plugin: pluginFromToolName(tool),
			tags: [],
			effects: [],
		};
	}
	return {
		name: tool.name,
		plugin: pluginFromToolName(tool.name),
		...(tool.summary === undefined ? {} : { summary: tool.summary }),
		tags: tool.tags ?? [],
		effects: (tool.effects ?? []) as readonly IToolEffect[],
	};
};

const HOST_NAMESPACE = 'mcp-vertex';
const HOST_PREFIX = `${HOST_NAMESPACE}_`;

export const pluginFromToolName = (toolName: string): string => {
	// Tools are namespaced by the host as `mcp-vertex_<rest>`. A core
	// meta-tool has no further segment (e.g. `mcp-vertex_overview`,
	// `mcp-vertex_status`) and keeps the host namespace (`mcp-vertex`);
	// a plugin tool (e.g. `mcp-vertex_quality_run_quality`) returns its
	// plugin prefix (`quality`).
	if (!toolName.startsWith(HOST_PREFIX)) {
		const [prefix] = toolName.split('_', 1);
		return prefix ?? toolName;
	}
	const stripped = toolName.slice(HOST_PREFIX.length);
	if (!stripped.includes('_')) return HOST_NAMESPACE;
	const [prefix] = stripped.split('_', 1);
	return prefix ?? toolName;
};
