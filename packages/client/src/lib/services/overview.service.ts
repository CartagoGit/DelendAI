import type { McpStdioClient } from '../transport/mcp-stdio-client';
import type {
	IOverview,
	IOverviewTool,
	IToolDescriptor,
	IToolEffect,
} from '../contracts/interfaces/tool-descriptor.interface';

export interface IOverviewOptions {
	readonly compact?: boolean;
	readonly tag?: string;
}

export class OverviewService {
	constructor(private readonly client: McpStdioClient) {}

	async getOverview(options: IOverviewOptions = {}): Promise<IOverview> {
		return this.client.request<IOverviewOptions, IOverview>(
			'mcp-vertex_overview',
			options,
		);
	}

	async listTools(): Promise<readonly IToolDescriptor[]> {
		const overview = await this.getOverview({ compact: true });
		return overview.tools.map((tool) => normalizeTool(tool));
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
