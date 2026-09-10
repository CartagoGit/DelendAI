import {
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
	mkdirSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { assembleCliConfig } from '@delendai/core/lib/cli/assemble';
import { createMcpProject } from '@delendai/core/lib/project/create-mcp-project';
import { nodeDynamicImport } from '@delendai/core/lib/plugins/load-plugins';
import { parseCliArgs } from '@delendai/core/lib/plugins/parse-cli-args';
import { TOKEN_BUDGETS } from '@delendai/core/public';

import { drainLiveBuffers } from '../../../plugins/usage-tracking/src/lib/record-buffer';
import { regenerateUsageSummary } from '../../../plugins/usage-tracking/src/lib/services/usage-rollup.service';
import {
	HOST_OVERHEAD_TOKENS,
	PUBLISHED_PIPELINE_TOOL_NAMES,
	estimateBudgetTokens,
	readPublishedToolBudgets,
} from './fake-subprocess';

const here = dirname(fileURLToPath(import.meta.url));
const workspaceRoot = resolve(here, '../../..');
const fakeSubprocessPath = resolve(here, 'fake-subprocess.ts');
const publishedBudgets = readPublishedToolBudgets(workspaceRoot);
const expectedBudgetTokens = estimateBudgetTokens(
	publishedBudgets,
	TOKEN_BUDGETS.bytesPerEstimatedToken,
);

type TStructuredResult<T> = { readonly structuredContent: T };

interface IUsageRow {
	readonly plugin: string;
	readonly tool: string;
	readonly responseBytes?: number;
	readonly tokenCount?: number | null;
	readonly usage?: {
		readonly totalTokens?: number;
	};
	readonly dimensions?: {
		readonly plugin?: string;
		readonly tool?: string;
	};
}

const readJsonl = (path: string): IUsageRow[] =>
	readFileSync(path, 'utf8')
		.split('\n')
		.filter((line) => line.trim() !== '')
		.map((line) => JSON.parse(line) as IUsageRow);

const usagePaths = (workspace: string, cacheDir: string) => {
	const base = join(workspace, cacheDir, 'results', 'usage-tracking');
	return {
		invocationsPath: join(base, 'invocations.jsonl'),
		summaryPath: join(base, 'usage-summary.json'),
	};
};

const asRecord = (value: unknown): Record<string, unknown> | null =>
	typeof value === 'object' && value !== null
		? (value as Record<string, unknown>)
		: null;

const liftInvokeTelemetry = (result: unknown): unknown => {
	const root = asRecord(result);
	const structured = asRecord(root?.structuredContent);
	if (!root || !structured) return result;
	const nestedResult = asRecord(structured.result);
	if (!nestedResult) return result;
	const nestedStructured = asRecord(nestedResult.structuredContent);
	const usage = asRecord(nestedStructured?.usage ?? nestedResult.usage);
	if (usage === null || structured.usage !== undefined) return result;
	return {
		...root,
		structuredContent: {
			...structured,
			usage,
		},
	};
};

describe('e2e: routing full pipeline smoke', () => {
	let workspace = '';
	let client: Client;
	let close = async () => undefined;
	let previousGroqApiKey: string | undefined;

	beforeEach(async () => {
		workspace = mkdtempSync(join(tmpdir(), 'routing-e2e-'));
		mkdirSync(join(workspace, 'src'), { recursive: true });
		writeFileSync(
			join(workspace, 'src', 'index.ts'),
			'export const routingSmoke = true;\n',
		);
		writeFileSync(
			join(workspace, 'delendai.config.json'),
			JSON.stringify(
				{
					plugins: {
						'usage-tracking': {
							options: {
								maxBatch: 1,
								maxDelayMs: 10,
								summaryIntervalMs: 60_000,
							},
						},
						'agent-orchestrator': {
							options: {
								allowFakeDispatchPort: true,
								policy: {
									defaultMode: 'linear',
									defaults: {
										budget: {
											maxTokensOrchestrator: 20_000,
											maxTokensPerSubagent: 4_000,
											timeoutMs: 5_000,
										},
										rotation: {
											maxIterationsPerSubagent: 2,
											allow: ['error-storm'],
										},
									},
								},
							},
						},
						'orchestrator-runner': {
							options: {
								providers: [
									{
										id: 'fake-local-mcp',
										kind: 'mcp-server',
										invoke: {
											kind: 'mcp-server',
											server: `bun ${fakeSubprocessPath}`,
											tool: 'route_task',
											args: {
												expectedBudgetTokens,
												hostOverheadTokens:
													HOST_OVERHEAD_TOKENS,
												pipelineId: 'routing-smoke',
												toolNames: [
													...PUBLISHED_PIPELINE_TOOL_NAMES,
												],
											},
										},
										modelId: 'fake-subprocess-model',
										contextWindow: 200_000,
										costTier: 2,
										strengths: [
											'reasoning',
											'code-edit',
											'json-strict',
										],
										weaknesses: [],
									},
								],
								invokeTimeoutMs: 5_000,
								maxFallbackDepth: 1,
								fallbackStrategy: 'rerank',
								executeApi: false,
								confirmBeforeExecute: true,
							},
						},
					},
				},
				null,
				2,
			),
		);

		previousGroqApiKey = process.env.GROQ_API_KEY;
		process.env.GROQ_API_KEY = 'test-groq-key';

		const args = parseCliArgs(
			[
				'--plugins=usage-tracking,orchestrator-runner,agent-orchestrator,auto-agent-selector,auto-plugin-selector',
				`--workspace=${workspace}`,
				'--surface=native',
			],
			workspace,
		);
		const assembledConfig = await assembleCliConfig(args, {
			import: async (specifier: string) =>
				(await nodeDynamicImport(specifier)) as { default: unknown },
			readFile: async (absolutePath: string) => {
				try {
					return readFileSync(absolutePath, 'utf8');
				} catch {
					return undefined;
				}
			},
		});
		const originalOnToolCall = assembledConfig.config.onToolCall;
		assembledConfig.config.onToolCall = (
			toolName,
			hookArgs,
			result,
			error,
			elapsedMs,
		) =>
			originalOnToolCall?.(
				toolName,
				hookArgs,
				toolName === 'delendai_orchestrator-runner_invoke'
					? liftInvokeTelemetry(result)
					: result,
				error,
				elapsedMs,
			);
		const assembled = await createMcpProject(assembledConfig.config);
		const [clientTransport, serverTransport] =
			InMemoryTransport.createLinkedPair();
		await assembled.server.connect(serverTransport);
		client = new Client(
			{ name: 'routing-e2e', version: '0.0.0' },
			{ capabilities: {} },
		);
		await client.connect(clientTransport);
		close = async () => {
			await client.close();
			await assembled.server.close();
		};
	});

	afterEach(async () => {
		await close();
		await drainLiveBuffers();
		if (previousGroqApiKey === undefined) delete process.env.GROQ_API_KEY;
		else process.env.GROQ_API_KEY = previousGroqApiKey;
		rmSync(workspace, { recursive: true, force: true });
	});

	it('assembles the real host path and records one invoke with budget-aligned usage', async () => {
		const autoStatus = (await client.callTool({
			name: 'delendai_auto-agent-selector_auto_status',
			arguments: {},
		})) as TStructuredResult<{
			available: Array<{
				id: string;
				label: string;
				source: 'cli' | 'api';
				vendor: string;
				reach: string;
				costTier: number;
			}>;
			availableCount: number;
		}>;
		expect(autoStatus.structuredContent.availableCount).toBeGreaterThan(0);
		expect(
			autoStatus.structuredContent.available.map(
				(candidate) => candidate.id,
			),
		).toContain('groq-api');

		const pluginsRecommend = (await client.callTool({
			name: 'delendai_auto-plugin-selector_plugins_recommend',
			arguments: {
				signals: {
					pack: 'generic',
					languages: ['plugins', 'catalog', 'routing'],
					hasDocsSite: true,
					hasTests: true,
					taskHint: 'routing smoke pipeline',
				},
				currentPlugins: [
					'usage-tracking',
					'orchestrator-runner',
					'agent-orchestrator',
					'auto-agent-selector',
					'auto-plugin-selector',
				],
				providerCandidates: autoStatus.structuredContent.available,
				refine: true,
			},
		})) as TStructuredResult<{
			recommendations: Array<{ plugin: { id: string } }>;
			llmRationale: { reachable: boolean; providerId?: string } | null;
		}>;
		expect(
			pluginsRecommend.structuredContent.recommendations.length,
		).toBeGreaterThan(0);
		expect(pluginsRecommend.structuredContent.llmRationale?.reachable).toBe(
			true,
		);
		expect(
			pluginsRecommend.structuredContent.llmRationale?.providerId,
		).toBe('groq-api');

		const autoRun = (await client.callTool({
			name: 'delendai_auto-agent-selector_auto_run',
			arguments: {
				task: 'Route this routing smoke task',
				costCeiling: 3,
				maxDepth: 2,
			},
		})) as TStructuredResult<{
			ladder: Array<{ id: string }>;
			execution: unknown;
		}>;
		expect(autoRun.structuredContent.ladder[0]?.id).toBe('groq-api');
		expect(autoRun.structuredContent.execution).toBeNull();

		const pipelineId = 'routing-smoke';
		const taskDescription = `Route ${pipelineId} via ${autoRun.structuredContent.ladder[0]?.id} with ${pluginsRecommend.structuredContent.recommendations[0]?.plugin.id}`;
		const task = {
			id: pipelineId,
			description: taskDescription,
			tags: ['routing', 'smoke'],
			hint: 'medium' as const,
		};

		const plan = (await client.callTool({
			name: 'delendai_agent-orchestrator_plan',
			arguments: { task },
		})) as TStructuredResult<{
			mode: string;
			steps: Array<{ kind: string }>;
		}>;
		expect(plan.structuredContent.mode).toBe('linear');
		expect(
			plan.structuredContent.steps.some((step) => step.kind === 'spawn'),
		).toBe(true);

		const dispatch = (await client.callTool({
			name: 'delendai_agent-orchestrator_dispatch',
			arguments: { task },
		})) as TStructuredResult<{
			ok: boolean;
			budget: { consumedSubagents: Record<string, number> };
		}> & { isError?: boolean };
		// This used to assert `isError: true` and that the text contained
		// 'consumedSubagents' — which read like a deliberate refusal but
		// was the SDK rejecting the tool's own SUCCESS with `-32602 ...
		// expected record, received Map at budget.consumedSubagents`. No
		// successful dispatch could reach a client at all; the assertion
		// pinned the defect in place by matching the field name inside
		// the validation error.
		expect(dispatch.isError).toBeFalsy();
		expect(dispatch.structuredContent.budget.consumedSubagents).toEqual(
			expect.any(Object),
		);

		const dispatchBudget = (await client.callTool({
			name: 'delendai_agent-orchestrator_budget',
			arguments: { taskId: pipelineId },
		})) as TStructuredResult<{
			steps: number;
		}>;
		expect(dispatchBudget.structuredContent.steps).toBeGreaterThan(0);

		const dispatchPlanRef = (await client.callTool({
			name: 'delendai_agent-orchestrator_plan_ref',
			arguments: { taskId: pipelineId },
		})) as TStructuredResult<{
			mode: string;
			rationale: string;
		}>;
		expect(dispatchPlanRef.structuredContent.mode).toBe('linear');
		expect(dispatchPlanRef.structuredContent.rationale).not.toContain(
			'no plan',
		);

		const invoke = (await client.callTool({
			name: 'delendai_orchestrator-runner_invoke',
			arguments: {
				task: taskDescription,
				mode: 'implement',
				capabilityHints: ['reasoning', 'json-strict'],
				detail: 'full',
				sessionId: 'routing-smoke-session',
				toolsAllow: [...PUBLISHED_PIPELINE_TOOL_NAMES],
				timeoutMs: 5_000,
				fallbackStrategy: 'rerank',
			},
		})) as TStructuredResult<{
			decision: { targetProvider: { id: string; kind: string } };
			result: {
				text: string;
				structuredContent: {
					pipeline: {
						id: string;
						prompt: string;
						expectedBudgetTokens: number;
						hostOverheadTokens: number;
						totalTokens: number;
					};
					usage: { totalTokens: number };
				};
			};
		}>;
		expect(invoke.structuredContent.decision.targetProvider.id).toBe(
			'fake-local-mcp',
		);
		expect(invoke.structuredContent.decision.targetProvider.kind).toBe(
			'mcp-server',
		);
		expect(invoke.structuredContent.result.text).toBe(
			`smoke:${taskDescription}`,
		);
		expect(
			invoke.structuredContent.result.structuredContent.pipeline,
		).toEqual({
			id: pipelineId,
			prompt: taskDescription,
			toolNames: [...PUBLISHED_PIPELINE_TOOL_NAMES],
			expectedBudgetTokens,
			hostOverheadTokens: HOST_OVERHEAD_TOKENS,
			totalTokens: expectedBudgetTokens + HOST_OVERHEAD_TOKENS,
		});

		await drainLiveBuffers();
		const cliArgs = parseCliArgs([`--workspace=${workspace}`], workspace);
		const { invocationsPath, summaryPath } = usagePaths(
			workspace,
			cliArgs.cacheDir,
		);
		const rows = readJsonl(invocationsPath);
		const invokeRows = rows.filter(
			(row) =>
				row.plugin === 'orchestrator-runner' && row.tool === 'invoke',
		);
		expect(invokeRows).toHaveLength(1);
		expect(invokeRows[0]?.tokenCount).toBe(
			expectedBudgetTokens + HOST_OVERHEAD_TOKENS,
		);

		const summary = await regenerateUsageSummary(
			invocationsPath,
			summaryPath,
			7,
			Date.now(),
		);
		expect(summary.invocationTelemetry.totals.calls).toBe(rows.length);
		expect(
			summary.invocationTelemetry.byTool.find(
				(bucket) => bucket.key === 'orchestrator-runner/invoke',
			)?.calls,
		).toBe(1);
		expect(summary.invocationTelemetry.totals.totalTokens).toBe(
			expectedBudgetTokens + HOST_OVERHEAD_TOKENS,
		);
		expect(
			summary.invocationTelemetry.totals.totalTokens,
		).toBeGreaterThanOrEqual(expectedBudgetTokens);
		expect(
			summary.invocationTelemetry.totals.totalTokens,
		).toBeLessThanOrEqual(expectedBudgetTokens + HOST_OVERHEAD_TOKENS);
	});
});
