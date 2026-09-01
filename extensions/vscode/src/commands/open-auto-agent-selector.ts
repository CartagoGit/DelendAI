/**
 * `registerOpenAutoAgentSelectorCommand` — opens (or refreshes) the
 * `Auto-agent selector` webview. Surfaces the auto-agent-selector
 * plugin's `auto_status` output (the roster of reachable LLM/agent
 * providers) and, when a task type is supplied via the optional
 * `taskType` argument, an `auto_recommend` ranking for that task.
 *
 * Reuses the script-free `renderJsonHtml` policy (f00079 S1) so the
 * default-deny CSP applies as-is — same posture as show-overview /
 * metrics / validation / proposals. The user reviews the roster here
 * and pins a per-task choice through the CLI (`mcpv agents recommend
 * --pin=<provider>`) or `mcp-vertex.openConfigurationCenter`.
 */
import { formatToolName, type McpStdioClient } from '@mcp-vertex/client';

import type { ICommandDeps } from './types';
import { renderJsonHtml } from './types';

export const OPEN_AUTO_AGENT_SELECTOR_COMMAND =
	'mcp-vertex.openAutoAgentSelector';

export interface IAutoAgentSelectorPayload {
	readonly status: unknown;
	readonly recommendation?: unknown;
	readonly taskType?: string;
	readonly costQualityTradeoff?: number;
	readonly fetchedAt: string;
}

const asRecord = (value: unknown): Record<string, unknown> =>
	value !== null && typeof value === 'object'
		? (value as Record<string, unknown>)
		: {};

const callSelectorTool = async (
	client: McpStdioClient,
	toolName: string,
	args: Readonly<Record<string, unknown>>,
): Promise<unknown> =>
	client.request<Readonly<Record<string, unknown>>, unknown>(toolName, args);

export const registerOpenAutoAgentSelectorCommand = (deps: ICommandDeps) =>
	deps.vscode.commands.registerCommand(
		OPEN_AUTO_AGENT_SELECTOR_COMMAND,
		async (rawArgs?: unknown) => {
			const panel = deps.vscode.window.createWebviewPanel(
				'mcpVertexAutoAgentSelector',
				'Auto-agent selector',
				deps.vscode.ViewColumn.One,
				{ enableScripts: false },
			);
			panel.webview.html = renderJsonHtml('Auto-agent selector', {
				state: 'loading',
			});
			try {
				const args = asRecord(rawArgs);
				const taskType =
					typeof args.taskType === 'string' &&
					args.taskType.length > 0
						? args.taskType
						: undefined;
				const costQualityTradeoff =
					typeof args.costQualityTradeoff === 'number' &&
					Number.isFinite(args.costQualityTradeoff)
						? args.costQualityTradeoff
						: undefined;

				const prefix = deps.namespacePrefix ?? 'mcp-vertex';
				const statusTool = formatToolName(
					prefix,
					'auto-agent-selector_auto_status',
				);
				const recommendTool = formatToolName(
					prefix,
					'auto-agent-selector_auto_recommend',
				);

				const status = await callSelectorTool(
					deps.client,
					statusTool,
					{},
				);

				let recommendation: unknown;
				if (taskType !== undefined) {
					const recommendArgs: Record<string, unknown> = { taskType };
					if (costQualityTradeoff !== undefined) {
						recommendArgs.costQualityTradeoff = costQualityTradeoff;
					}
					recommendation = await callSelectorTool(
						deps.client,
						recommendTool,
						recommendArgs,
					);
				}

				const payload: IAutoAgentSelectorPayload = {
					status,
					...(recommendation !== undefined ? { recommendation } : {}),
					...(taskType !== undefined ? { taskType } : {}),
					...(costQualityTradeoff !== undefined
						? { costQualityTradeoff }
						: {}),
					fetchedAt: new Date().toISOString(),
				};

				panel.webview.html = renderJsonHtml(
					'Auto-agent selector',
					payload,
				);
				return panel;
			} catch (err) {
				panel.webview.html = renderJsonHtml(
					'Auto-agent selector unavailable',
					{
						state: 'error',
						message:
							err instanceof Error ? err.message : String(err),
					},
				);
				return panel;
			}
		},
	);
