import type { McpStdioClient } from '../transport/mcp-stdio-client';
import type {
	IOverview,
	IOverviewTool,
	IToolDescriptor,
	IToolEffect,
} from '../contracts/interfaces/tool-descriptor.interface';
import { formatToolName } from './_namespace';

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
 * it is MORE reliable than parsing the plugin out of a flat name.
 */
export const normalizeCompactTools = (
	tools: IOverview['tools'],
	namespacePrefix: string,
): IToolDescriptor[] => {
	if (Array.isArray(tools)) {
		return tools.map((tool) => normalizeTool(tool));
	}
	const out: IToolDescriptor[] = [];
	for (const [group, stems] of Object.entries(tools)) {
		for (const stem of stems) {
			const name =
				group === 'core'
					? `${namespacePrefix}_${stem}`
					: `${namespacePrefix}_${group}_${stem}`;
			out.push({
				name,
				plugin: group === 'core' ? namespacePrefix : group,
				tags: [],
				effects: [],
			});
		}
	}
	return out;
};

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
