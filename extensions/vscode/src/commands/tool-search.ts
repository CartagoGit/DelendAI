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
	KnowledgeService,
	OverviewService,
	SearchService,
} from '@mcp-vertex/client';
import type { IQuickPickItem } from '@mcp-vertex/ui-extension/public';

import type { ICommandDeps } from './types';

export const TOOL_SEARCH_COMMAND = 'mcp-vertex.toolSearch';

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
			const overview = new OverviewService(deps.client);
			const knowledge = new KnowledgeService(deps.client);
			const search = new SearchService(deps.client);

			const ov = await overview.getOverview({ compact: true });
			const knowledgeList = await knowledge
				.listKnowledge()
				.catch(() => []);

			const allTools = (ov.tools ?? []).map((t) =>
				typeof t === 'string'
					? { name: t, tags: [] as readonly string[] }
					: { name: t.name, tags: t.tags ?? [] },
			);
			const query = initialQueryOf(rawArgs);

			// When the caller provided a query we pre-filter with the
			// server-side `search.searchTools` (the canonical MCP search
			// tool); when they did not, we show the full list so the user
			// can still pick from the overview without typing.
			const toolItems: IQuickPickItem[] =
				query.length === 0
					? allTools.map((t) => ({
							id: `tool:${t.name}`,
							label: t.name,
							description: `tool · ${t.name.split('_', 1)[0] ?? ''}`,
						}))
					: search.searchTools(query, allTools, 200).map((h) => ({
							id: `tool:${h.name}`,
							label: h.name,
							description: `tool · ${h.plugin}`,
							detail:
								h.source === 'description'
									? 'matched in description'
									: undefined,
						}));

			const knowledgeItems: IQuickPickItem[] = knowledgeList.map((k) => ({
				id: `knowledge:${k.id}`,
				label: k.title,
				description: 'knowledge',
				detail: k.id,
			}));

			const items: IQuickPickItem[] = [...toolItems, ...knowledgeItems];

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
			if (picked.startsWith('knowledge:')) {
				const id = picked.slice('knowledge:'.length);
				const entry = await knowledge.getKnowledge(id);
				await deps.vscode.window.showInformationMessage?.(
					`mcp-vertex: ${entry.title}\n\n${entry.body.slice(0, 500)}`,
				);
				return;
			}
		},
	);
