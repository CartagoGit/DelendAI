import { definePlugin } from '@mcp-vertex/core/public';
import { z } from 'zod';

import { buildDiagramDepsRegistration } from './lib/tools/diagram-deps.tool';

/**
 * Diagram plugin. `diagram_deps` renders the workspace's internal dependency
 * graph as a mermaid flowchart (which renders natively in the docs site and in
 * artifacts), so an agent can *see* the project's structure. Offline, pure, no
 * external tools. Load with `mcp-vertex --plugins=diagram`.
 */
const OptionsSchema = z.object({});

export default definePlugin({
	name: 'diagram',
	version: '0.1.0',
	describe:
		'Diagram generation: diagram_deps renders the workspace internal dependency graph as a mermaid flowchart. Offline, pure.',
	optionsSchema: OptionsSchema,
	register(ctx) {
		return {
			tools: [
				buildDiagramDepsRegistration({
					namespacePrefix: ctx.namespacePrefix,
					workspaceRootAbs: ctx.workspace.root,
				}),
			],
			knowledge: [
				{
					id: 'diagram-usage',
					title: 'Diagram generation',
					body: [
						'# Diagram generation',
						'',
						`Tool: \`${ctx.namespacePrefix}_diagram_deps\` — workspace internal dependency graph as mermaid.`,
						'',
						'- Returns a `flowchart LR` mermaid string (renders in the docs site + artifacts) plus raw nodes/edges.',
						'- Only edges between same-workspace packages are drawn; external deps are ignored.',
						'- Offline and pure — no external tools, no network.',
					].join('\n'),
				},
			],
		};
	},
});
