import {
	KnowledgeService,
	MetricsService,
	OverviewService,
	pluginFromToolName,
	type IMcpToolDescriptor,
	type IToolDescriptor,
	type IToolEffect,
} from '@delendai/client';
import { renderToolDetailHtml } from '@delendai/ui-extension/webview';
import type { IToolDetail } from '@delendai/ui-extension/webview';
import type { IToolDetailCopy } from '@delendai/ui-extension/webview';

import type { IRenderableSchema } from '../views/render-output-schema';
import { resolveViewLang, viewCopyFor } from '../i18n/view-copy.strings';
import { OPEN_TOOL_DETAIL_COMMAND } from '../contracts/constants/open-tool-detail-command.constant';
import type { IViewCopy } from '../contracts/interfaces/view-copy.interface';
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
	deps: Pick<ICommandDeps, 'client' | 'namespacePrefix' | 'globalState'>,
	arg: IToolDetailArgument,
): Promise<{
	readonly html: string;
	readonly model: IToolDetail;
}> => {
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
	const model: IToolDetail = {
		tool,
		...(isRenderableSchema(schemaTool?.inputSchema)
			? { inputSchema: schemaTool.inputSchema as IRenderableSchema }
			: {}),
		...(isRenderableSchema(schemaTool?.outputSchema)
			? { outputSchema: schemaTool.outputSchema as IRenderableSchema }
			: {}),
		...(knowledgeBody === undefined ? {} : { knowledgeBody }),
		...(metrics === undefined ? {} : { metrics }),
		copy: projectToolDetailCopy(
			viewCopyFor(
				resolveViewLang(
					deps.globalState?.get<unknown>('delendai:lang'),
				),
			),
		),
	};
	return { html: renderToolDetailHtml(model), model };
};

/**
 * `IToolDetail` is host-agnostic; the legacy `IViewCopy` carries a
 * few extra strings the shared renderer does not consume. Project
 * the subset we need so the dashboard shell can render the same
 * detail without importing VS Code vocabulary.
 */
const projectToolDetailCopy = (copy: IViewCopy): IToolDetailCopy => ({
	lang: copy.lang,
	knowledge: copy.knowledge,
	inputSchema: copy.inputSchema,
	noInputSchema: copy.noInputSchema,
	outputSchema: copy.outputSchema,
	noOutputSchema: copy.noOutputSchema,
	metrics: copy.metrics,
	noCalls: copy.noCalls,
	callSingular: copy.callSingular,
	calls: copy.calls,
	errorSingular: copy.errorSingular,
	errors: copy.errors,
	max: copy.max,
	items: copy.items,
	required: copy.required,
	optional: copy.optional,
	enumLabel: copy.enumLabel,
});

export const registerOpenToolDetailCommand = (deps: ICommandDeps) =>
	deps.vscode.commands.registerCommand(
		OPEN_TOOL_DETAIL_COMMAND,
		async (arg?: unknown) => {
			try {
				const { html, model } = await buildToolDetailHtml(
					deps,
					(arg ?? '') as IToolDetailArgument,
				);
				const sinkHandled =
					(await deps.detailSink?.('tool', model)) === true;
				if (sinkHandled) return undefined;
				const panel = deps.vscode.window.createWebviewPanel(
					'delendaiToolDetail',
					'delendai Tool Detail',
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
