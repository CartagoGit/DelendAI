import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

export const PUBLISHED_PIPELINE_TOOL_NAMES = [
	'delendai_auto-agent-selector_auto_run',
	'delendai_auto-plugin-selector_plugins_recommend',
	'delendai_agent-orchestrator_plan',
	'delendai_agent-orchestrator_dispatch',
] as const;

export const HOST_OVERHEAD_TOKENS = 128;

export interface IPublishedToolBudget {
	readonly toolName: string;
	readonly totalBytes: number;
}

const TOOL_ROW = /^\|\s*(delendai_[^|]+)\s*\|\s*[^|]+\|\s*([0-9,]+)\s*\|/u;

export const readPublishedToolBudgets = (
	workspaceRoot: string,
	toolNames: readonly string[] = PUBLISHED_PIPELINE_TOOL_NAMES,
): readonly IPublishedToolBudget[] => {
	const doc = readFileSync(
		resolve(workspaceRoot, 'docs/delendai/TOKEN-BUDGETS.md'),
		'utf8',
	);
	const rows = new Map<string, number>();
	for (const line of doc.split('\n')) {
		const match = TOOL_ROW.exec(line);
		if (!match) continue;
		const toolName = match[1]?.trim();
		const totalBytes = Number((match[2] ?? '').replaceAll(',', ''));
		if (!toolName || !Number.isFinite(totalBytes)) continue;
		rows.set(toolName, totalBytes);
	}
	return toolNames.map((toolName) => {
		const totalBytes = rows.get(toolName);
		if (totalBytes === undefined) {
			throw new Error(
				`Missing published token budget row for ${toolName} in docs/delendai/TOKEN-BUDGETS.md`,
			);
		}
		return { toolName, totalBytes };
	});
};

export const estimateBudgetTokens = (
	budgets: readonly IPublishedToolBudget[],
	bytesPerEstimatedToken: number,
): number =>
	Math.ceil(
		budgets.reduce((total, budget) => total + budget.totalBytes, 0) /
			bytesPerEstimatedToken,
	);

interface IFakeInvokeArgs {
	readonly prompt?: string;
	readonly expectedBudgetTokens?: number;
	readonly hostOverheadTokens?: number;
	readonly pipelineId?: string;
	readonly toolNames?: readonly string[];
	readonly [key: string]: unknown;
}

const asObject = (value: unknown): Record<string, unknown> | null =>
	typeof value === 'object' && value !== null
		? (value as Record<string, unknown>)
		: null;

const buildResponse = (id: number | string, args: IFakeInvokeArgs) => {
	const expectedBudgetTokens =
		typeof args.expectedBudgetTokens === 'number'
			? args.expectedBudgetTokens
			: 0;
	const hostOverheadTokens =
		typeof args.hostOverheadTokens === 'number'
			? args.hostOverheadTokens
			: HOST_OVERHEAD_TOKENS;
	const totalTokens = expectedBudgetTokens + hostOverheadTokens;
	const prompt = typeof args.prompt === 'string' ? args.prompt : '';
	return {
		jsonrpc: '2.0' as const,
		id,
		result: {
			content: [{ type: 'text' as const, text: `smoke:${prompt}` }],
			structuredContent: {
				ok: true,
				usage: {
					inputTokens: expectedBudgetTokens,
					outputTokens: hostOverheadTokens,
					totalTokens,
				},
				model: {
					provider: 'fake-subprocess',
					modelId: 'fake-subprocess-model',
					kind: 'mcp-server',
				},
				pipeline: {
					id:
						typeof args.pipelineId === 'string'
							? args.pipelineId
							: 'routing-smoke',
					prompt,
					toolNames: Array.isArray(args.toolNames)
						? args.toolNames
						: [],
					expectedBudgetTokens,
					hostOverheadTokens,
					totalTokens,
				},
			},
		},
	};
};

export const startFakeSubprocessServer = (): void => {
	process.stdin.setEncoding('utf8');
	let buffer = '';
	process.stdin.on('data', (chunk) => {
		buffer += chunk;
		let newlineIndex = buffer.indexOf('\n');
		while (newlineIndex !== -1) {
			const line = buffer.slice(0, newlineIndex);
			buffer = buffer.slice(newlineIndex + 1);
			newlineIndex = buffer.indexOf('\n');
			if (line.trim() === '') continue;
			let message: Record<string, unknown>;
			try {
				message = JSON.parse(line) as Record<string, unknown>;
			} catch {
				continue;
			}
			if (message.method !== 'tools/call') continue;
			const params = asObject(message.params);
			const args = asObject(params?.arguments) as IFakeInvokeArgs | null;
			if (message.id === undefined || args === null) continue;
			process.stdout.write(
				`${JSON.stringify(buildResponse(message.id as number | string, args))}\n`,
			);
		}
	});
};

if (process.argv[1]?.endsWith('fake-subprocess.ts')) {
	startFakeSubprocessServer();
}
