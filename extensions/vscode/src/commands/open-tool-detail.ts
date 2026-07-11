import {
	KnowledgeService,
	MetricsService,
	OverviewService,
	pluginFromToolName,
	type IMcpToolDescriptor,
	type IToolDescriptor,
	type IToolEffect,
} from '@mcp-vertex/client';

import type { IRenderableSchema } from '../views/render-output-schema';
import { renderToolDetailHtml } from '../views/tool-detail-webview';
import { OPEN_TOOL_DETAIL_COMMAND } from '../contracts/constants/open-tool-detail-command.constant';
import type { ICommandDeps } from './types';
import { showCommandError } from './types';

type IToolDetailArgument =
	| string
	| IToolDescriptor
	| {
			readonly name?: unknown;
			readonly plugin?: unknown;
			readonly summary?: unknown;
			readonly tags?: unknown;
			readonly effects?: unknown;
	  };

const isStringArray = (value: unknown): value is readonly string[] =>
	Array.isArray(value) && value.every((entry) => typeof entry === 'string');

const TOOL_EFFECTS = new Set<IToolEffect>([
	'write',
	'spawn',
	'network',
	'destructive',
]);

const isToolEffectArray = (value: unknown): value is readonly IToolEffect[] =>
	Array.isArray(value) &&
	value.every(
		(entry): entry is IToolEffect =>
			typeof entry === 'string' && TOOL_EFFECTS.has(entry as IToolEffect),
	);

const isRenderableSchema = (value: unknown): value is IRenderableSchema =>
	typeof value === 'object' && value !== null && !Array.isArray(value);

const descriptorFromArgument = (
	arg: IToolDetailArgument,
): IToolDescriptor | undefined => {
	if (typeof arg === 'string' && arg.length > 0) {
		return {
			name: arg,
			plugin: pluginFromToolName(arg),
			tags: [],
			effects: [],
		};
	}
	if (typeof arg !== 'object' || arg === null) return undefined;
	if (typeof arg.name !== 'string' || arg.name.length === 0) return undefined;
	const tags = isStringArray(arg.tags) ? arg.tags : [];
	const effects = isToolEffectArray(arg.effects) ? arg.effects : [];
	return {
		name: arg.name,
		plugin:
			typeof arg.plugin === 'string' && arg.plugin.length > 0
				? arg.plugin
				: pluginFromToolName(arg.name),
		...(typeof arg.summary === 'string' ? { summary: arg.summary } : {}),
		tags,
		effects,
	};
};

const descriptorFromMcpTool = (tool: IMcpToolDescriptor): IToolDescriptor => ({
	name: tool.name,
	plugin: pluginFromToolName(tool.name),
	...(tool.description === undefined ? {} : { summary: tool.description }),
	tags: [],
	effects: [],
});

const findToolSchema = async (
	deps: Pick<ICommandDeps, 'client'>,
	toolName: string,
): Promise<IMcpToolDescriptor | undefined> =>
	(await deps.client.listTools()).find((tool) => tool.name === toolName);

const loadKnowledgeBody = async (
	deps: Pick<ICommandDeps, 'client'>,
	tool: IToolDescriptor,
): Promise<string | undefined> => {
	try {
		const service = new KnowledgeService(deps.client);
		const entries = await service.listKnowledge();
		const [hit] = service.filterByQuery(entries, tool.name, 1);
		const fallback =
			hit ?? service.filterByQuery(entries, tool.plugin, 1)[0];
		if (fallback === undefined) return undefined;
		return (await service.getKnowledge(fallback.id)).body;
	} catch {
		return undefined;
	}
};

export const buildToolDetailHtml = async (
	deps: Pick<ICommandDeps, 'client' | 'namespacePrefix'>,
	arg: IToolDetailArgument,
): Promise<string> => {
	const fromArg = descriptorFromArgument(arg);
	if (fromArg === undefined) {
		throw new Error('openToolDetail requires a tool name or descriptor');
	}
	const [overviewTools, schemaTool, metrics, knowledgeBody] =
		await Promise.all([
			new OverviewService(deps.client, deps.namespacePrefix).listTools(),
			findToolSchema(deps, fromArg.name),
			new MetricsService(deps.client).snapshot().catch(() => undefined),
			loadKnowledgeBody(deps, fromArg),
		]);
	const overviewTool =
		overviewTools.find((tool) => tool.name === fromArg.name) ?? fromArg;
	const tool =
		schemaTool === undefined
			? overviewTool
			: { ...descriptorFromMcpTool(schemaTool), ...overviewTool };
	return renderToolDetailHtml({
		tool,
		...(isRenderableSchema(schemaTool?.inputSchema)
			? { inputSchema: schemaTool.inputSchema }
			: {}),
		...(isRenderableSchema(schemaTool?.outputSchema)
			? { outputSchema: schemaTool.outputSchema }
			: {}),
		...(knowledgeBody === undefined ? {} : { knowledgeBody }),
		...(metrics === undefined ? {} : { metrics }),
	});
};

export const registerOpenToolDetailCommand = (deps: ICommandDeps) =>
	deps.vscode.commands.registerCommand(
		OPEN_TOOL_DETAIL_COMMAND,
		async (arg?: unknown) => {
			try {
				const html = await buildToolDetailHtml(
					deps,
					(arg ?? '') as IToolDetailArgument,
				);
				const panel = deps.vscode.window.createWebviewPanel(
					'mcpVertexToolDetail',
					'mcp-vertex Tool Detail',
					deps.vscode.ViewColumn.One,
					{ enableScripts: false },
				);
				panel.webview.html = html;
				return panel;
			} catch (err) {
				await showCommandError(deps.vscode, 'open tool detail', err);
				return undefined;
			}
		},
	);
