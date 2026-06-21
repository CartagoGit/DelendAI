import type { IMcpTransport } from '../../src/lib/transport/mcp-transport.types';

interface IFakeCall {
	tool: string;
	args: unknown;
}

/**
 * Build a fake `IMcpTransport` that returns pre-canned responses
 * keyed by tool name. Tests pass a fixture to
 * `McpStdioClient.fromTransport(...)`.
 */
export interface IFakeTransportFixture {
	readonly transport: IMcpTransport;
	readonly calls: IFakeCall[];
}

type ResponseMap = Readonly<Record<string, unknown>>;

export const createFakeTransport = (
	responses: ResponseMap,
): IFakeTransportFixture => {
	const calls: IFakeCall[] = [];
	const transport: IMcpTransport = {
		async callTool(args: { name: string; arguments?: unknown }) {
			calls.push({ tool: args.name, args: args.arguments });
			const response = responses[args.name];
			if (response === undefined) {
				return {
					content: [{ text: '{}' }],
					isError: false,
				};
			}
			return {
				structuredContent: response,
				content: [{ text: JSON.stringify(response) }],
				isError: false,
			};
		},
		async listTools() {
			return { tools: [] };
		},
		async close() {
			return undefined;
		},
	};
	return { transport, calls };
};

export const overviewFixture = {
	server: { name: 'mcp-vertex', version: '0.1.0' },
	namespacePrefix: 'mcp-vertex',
	plugins: [
		{ name: 'proposals', version: '0.1.0' },
		{ name: 'memory', version: '0.1.0' },
		{ name: 'quality', version: '0.1.0' },
	],
	tools: [
		{ name: 'mcp-vertex_overview', tags: ['orientation'] },
		{ name: 'mcp-vertex_metrics', tags: ['observability'] },
		{ name: 'proposals_proposal_board', tags: ['proposals'] },
		{ name: 'memory_recall', tags: ['memory'] },
		{ name: 'quality_run_quality', tags: ['quality'] },
	],
	knowledge: [
		{ id: 'overview', title: 'Overview' },
		{ id: 'plugins', title: 'Plugins' },
	],
	recommendedNextAction: 'Call mcp-vertex_overview to orient.',
};

export const metricsFixture = {
	tools: {
		'mcp-vertex_overview': {
			calls: 12,
			errors: 0,
			totalMs: 240,
			maxMs: 60,
			totalBytes: 2400,
		},
		'mcp-vertex_metrics': {
			calls: 8,
			errors: 0,
			totalMs: 80,
			maxMs: 20,
			totalBytes: 1600,
		},
		proposals_proposal_board: {
			calls: 4,
			errors: 1,
			totalMs: 320,
			maxMs: 200,
			totalBytes: 3200,
		},
		proposals_agent_names: {
			calls: 2,
			errors: 0,
			totalMs: 20,
			maxMs: 10,
			totalBytes: 200,
		},
		quality_run_quality: {
			calls: 1,
			errors: 0,
			totalMs: 1500,
			maxMs: 1500,
			totalBytes: 400,
		},
	},
	totals: {
		calls: 27,
		errors: 1,
		totalMs: 2160,
		totalBytes: 7800,
	},
};

export const proposalsFixture = {
	proposals: [
		{
			id: 'f00022',
			title: 'IDE extension v2',
			status: 'in_progress',
			track: 'apps+client+docs',
		},
		{
			id: 'f00028',
			title: 'Plugin depth extension',
			status: 'ready',
			track: 'plugins',
		},
		{
			id: 'f00014',
			title: 'IDE extension (closed)',
			status: 'done',
			track: 'apps+client+docs',
		},
	],
};

export const agentsFixture = {
	agents: [{ name: 'implementation_runner' }, { name: 'delivery_verifier' }],
};

export const allResponsesFixture: ResponseMap = {
	'mcp-vertex_overview': overviewFixture,
	'mcp-vertex_metrics': metricsFixture,
	proposals_proposal_board: proposalsFixture,
	proposals_agent_names: agentsFixture,
};
