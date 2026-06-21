/**
 * `mcp-vertex.toolSearch` — VS Code command that opens a QuickPick
 * populated with tools + knowledge entries matching the user's
 * query. Hit Enter on a tool to call it and show the result in an
 * output channel; hit Enter on a knowledge entry to show its body.
 *
 * Falls back gracefully if the search or knowledge tool is missing.
 */
import {
	KnowledgeService,
	OverviewService,
	SearchService,
} from '@mcp-vertex/client';
import type { IQuickPickItem } from '@mcp-vertex/ide/public';

import type { ICommandDeps } from './types';

export const TOOL_SEARCH_COMMAND = 'mcp-vertex.toolSearch';

export const registerToolSearchCommand = (deps: ICommandDeps) =>
	deps.vscode.commands.registerCommand(TOOL_SEARCH_COMMAND, async () => {
		const overview = new OverviewService(deps.client);
		const knowledge = new KnowledgeService(deps.client);
		const search = new SearchService(deps.client);

		const ov = await overview.getOverview({ compact: false });
		const knowledgeList = await knowledge.listKnowledge().catch(() => []);

		// The QuickPick already type-filters; for the initial (no
		// query) state we show every tool and knowledge entry.
		const allTools = (ov.tools ?? []).map((t) =>
			typeof t === 'string'
				? { name: t, tags: [] as readonly string[] }
				: { name: t.name, tags: t.tags ?? [] },
		);
		const query = '';

		// Show all tools when no query is active (empty string); the
		// QuickPick filters as the user types.
		const toolItems: IQuickPickItem[] = (
			query.length === 0 ? allTools.map((t) => ({ tool: t })) : []
		)
			.map((t) => ({
				id: `tool:${t.tool.name}`,
				label: t.tool.name,
				description: `tool · ${t.tool.name.split('_', 1)[0] ?? ''}`,
			}))
			.concat(
				query.length > 0
					? search.searchTools(query, allTools, 200).map((h) => ({
							id: `tool:${h.name}`,
							label: h.name,
							description: `tool · ${h.plugin}`,
							detail:
								h.source === 'description'
									? 'matched in description'
									: undefined,
						}))
					: [],
			);

		const knowledgeItems: IQuickPickItem[] = knowledgeList.map((k) => ({
			id: `knowledge:${k.id}`,
			label: k.title,
			description: 'knowledge',
			detail: k.id,
		}));

		const items: IQuickPickItem[] = [...toolItems, ...knowledgeItems];

		if (items.length === 0) {
			await deps.vscode.window.showInformationMessage?.(
				'mcp-vertex: no tools or knowledge entries to search.',
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
	});
