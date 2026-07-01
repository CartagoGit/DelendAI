/**
 * `mcp-vertex.toolSearch` — VS Code command that opens a QuickPick
 * populated with tools + knowledge entries matching the user's
 * query. Hit Enter on a tool to call it and show the result in an
 * output channel; hit Enter on a knowledge entry to show its body.
 *
 * Falls back gracefully if the search or knowledge tool is missing.
 *
 * Bug fix (tool-search UX): the previous version hard-coded `query = ''`
 * and unconditionally merged the full tool list with the search hits,
 * which meant `search.searchTools` was never actually invoked and the
 * comment "the QuickPick filters as the user types" was a lie (the
 * duck-typed `showQuickPick` shape does not expose `onDidChangeValue`).
 * We now accept the optional initial query via the command args (so the
 * command palette can pre-fill it) AND we honour the `query` when one
 * is provided — `search.searchTools` runs as designed and the list is
 * pre-filtered by the server instead of by an imaginary `onDidChangeValue`.
 */
import {
	AgentCatalogService,
	KnowledgeService,
	OverviewService,
	SearchService,
} from '@mcp-vertex/client';
import type { IQuickPickItem } from '@mcp-vertex/ui-extension/public';

import { openProposalPreview, openSkillPreview } from './open-agent-catalog';
import type { ICommandDeps } from './types';

export const TOOL_SEARCH_COMMAND = 'mcp-vertex.toolSearch';

const toolItemsOf = (
	tools: ReadonlyArray<{
		readonly name: string;
		readonly plugin: string;
		readonly summary?: string;
	}>,
): IQuickPickItem[] =>
	tools.map((tool) => ({
		id: `tool:${tool.name}`,
		label: tool.name,
		description: `Tools · ${tool.plugin}`,
		...(tool.summary === undefined ? {} : { detail: tool.summary }),
	}));

const skillItemsOf = (
	skills: ReadonlyArray<{
		readonly id: string;
		readonly summary: string;
		readonly tags: readonly string[];
	}>,
): IQuickPickItem[] =>
	skills.map((skill) => ({
		id: `skill:${skill.id}`,
		label: skill.id,
		description: `Skills · ${skill.tags.join(', ')}`,
		detail: skill.summary,
	}));

const proposalItemsOf = (
	proposals: ReadonlyArray<{
		readonly id: string;
		readonly title: string;
		readonly status: string;
	}>,
): IQuickPickItem[] =>
	proposals.map((proposal) => ({
		id: `proposal:${proposal.id}`,
		label: proposal.id,
		description: `Proposals · ${proposal.status}`,
		detail: proposal.title,
	}));

const fallbackItems = async (
	deps: ICommandDeps,
	query: string,
): Promise<IQuickPickItem[]> => {
	const overview = new OverviewService(deps.client, deps.namespacePrefix);
	const knowledge = new KnowledgeService(deps.client);
	const search = new SearchService(deps.client);

	const ov = await overview.getOverview({ compact: true });
	const knowledgeList = await knowledge.listKnowledge().catch(() => []);
	const allTools = (ov.tools ?? []).map((tool) =>
		typeof tool === 'string'
			? { name: tool, tags: [] as readonly string[] }
			: {
					name: tool.name,
					tags: tool.tags ?? [],
					...(tool.summary === undefined
						? {}
						: { summary: tool.summary }),
				},
	);

	const toolItems: IQuickPickItem[] =
		query.length === 0
			? allTools.map((tool) => ({
					id: `tool:${tool.name}`,
					label: tool.name,
					description: `tool · ${tool.name.split('_', 1)[0] ?? ''}`,
				}))
			: search.searchTools(query, allTools, 200).map((hit) => ({
					id: `tool:${hit.name}`,
					label: hit.name,
					description: `tool · ${hit.plugin}`,
					...(hit.source === 'description'
						? { detail: 'matched in description' }
						: {}),
				}));

	const knowledgeItems: IQuickPickItem[] = knowledgeList.map((entry) => ({
		id: `knowledge:${entry.id}`,
		label: entry.title,
		description: 'knowledge',
		detail: entry.id,
	}));

	return [...toolItems, ...knowledgeItems];
};

/** Extract an optional initial query from the command's args payload. */
const initialQueryOf = (raw: unknown): string => {
	if (typeof raw === 'string') return raw;
	if (raw !== null && typeof raw === 'object') {
		const candidate = (raw as { readonly query?: unknown }).query;
		if (typeof candidate === 'string') return candidate;
	}
	return '';
};

export const registerToolSearchCommand = (deps: ICommandDeps) =>
	deps.vscode.commands.registerCommand(
		TOOL_SEARCH_COMMAND,
		async (rawArgs?: unknown) => {
			const query = initialQueryOf(rawArgs);
			const catalog = new AgentCatalogService(deps.client);
			let items: IQuickPickItem[] = [];
			try {
				const results = await catalog.search(query);
				items = [
					...toolItemsOf(results.tools),
					...skillItemsOf(results.skills),
					...proposalItemsOf(results.proposals),
				];
			} catch {
				items = [];
			}

			if (items.length === 0) {
				items = await fallbackItems(deps, query);
			}

			if (items.length === 0) {
				await deps.vscode.window.showInformationMessage?.(
					query.length === 0
						? 'mcp-vertex: no tools or knowledge entries to search.'
						: `mcp-vertex: no matches for "${query}".`,
				);
				return;
			}

			const picked = await deps.vscode.window.showQuickPick?.(items);
			if (picked === undefined) return;

			if (picked.startsWith('tool:')) {
				const toolName = picked.slice('tool:'.length);
				const result = await deps.client.request(toolName, {});
				await deps.vscode.window.showInformationMessage?.(
					`mcp-vertex: ${toolName} → ${JSON.stringify(result).slice(0, 200)}`,
				);
				return;
			}
			if (picked.startsWith('skill:')) {
				await openSkillPreview(
					deps,
					catalog,
					picked.slice('skill:'.length),
				);
				return;
			}
			if (picked.startsWith('proposal:')) {
				await openProposalPreview(
					deps,
					picked.slice('proposal:'.length),
				);
				return;
			}
			if (picked.startsWith('knowledge:')) {
				const knowledge = new KnowledgeService(deps.client);
				const id = picked.slice('knowledge:'.length);
				const entry = await knowledge.getKnowledge(id);
				await deps.vscode.window.showInformationMessage?.(
					`mcp-vertex: ${entry.title}\n\n${entry.body.slice(0, 500)}`,
				);
				return;
			}
		},
	);
