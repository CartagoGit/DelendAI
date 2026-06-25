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

export const pluginFromToolName = (toolName: string): string => {
	// Strip the host's core namespace prefix first if present, so the
	// returned plugin is the plugin prefix (e.g. `quality`), not the
	// host prefix (e.g. `mcp-vertex`).
	const stripped = toolName.startsWith('mcp-vertex_')
		? toolName.slice('mcp-vertex_'.length)
		: toolName;
	const [prefix] = stripped.split('_', 1);
	return prefix ?? toolName;
};
