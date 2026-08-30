import { definePlugin } from '@mcp-vertex/core/public';
import z from 'zod';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildDiagramGraphToolRegistrations } from './lib/tools/diagram-graph.tool';
import { buildDiagramProposalsToolRegistrations } from './lib/tools/diagram-proposals.tool';

/**
 * Plugin's own source root, derived from `import.meta.url`. This is the
 * package directory (`plugins/diagram/`) — used as the default scan root
 * for `diagram_modules` so the tool does not walk the whole workspace on
 * a missing `packageRoot` argument. At runtime `import.meta.url` points
 * at the bundled `dist/index.js`, so the plugin package root is its
 * `..`. See f00030-protect-diagram-modules.
 */
const PLUGIN_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

/**
 * Diagram plugin. Four mermaid tools:
 *   - `diagram_deps`     — workspace internal dependency graph.
 *   - `diagram_modules`  — single-package file-level module graph.
 *   - `diagram_erd`      — re-render an IDatabaseSchema as an erDiagram.
 *   - `diagram_proposals`— the proposal status DFA + per-status counts.
 *
 * All four render natively in the docs site and in artifacts, so an
 * agent can *see* the project's structure. Offline, pure, no
 * external tools. Load with `mcp-vertex --plugins=diagram`.
 */
const OptionsSchema = z.object({});

export default definePlugin({
	name: 'diagram',
	version: '0.1.1',
	describe:
		'Diagram generation: diagram_deps + diagram_modules (workspace/package structure) + diagram_erd (DB schema) + diagram_proposals (proposal DFA) as mermaid. Offline, pure.',
	optionsSchema: OptionsSchema,
	register(ctx) {
		return {
			tools: [
				...buildDiagramGraphToolRegistrations({
					namespacePrefix: ctx.namespacePrefix,
					workspaceRootAbs: ctx.workspace.root,
					modulePackageRootAbs: PLUGIN_ROOT,
				}),
				...buildDiagramProposalsToolRegistrations({
					namespacePrefix: ctx.namespacePrefix,
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
						`Tool: \`${ctx.namespacePrefix}_diagram_modules\` — single package file-level module graph as mermaid. Pass \`packageRoot\` to override the default.`,
						`Tool: \`${ctx.namespacePrefix}_diagram_erd\` — re-render an IDatabaseSchema (from the database plugin) as a mermaid erDiagram.`,
						`Tool: \`${ctx.namespacePrefix}_diagram_proposals\` — the proposal status DFA, optionally annotated with per-status counts.`,
						'',
						'- All return a mermaid string (renders in the docs site + artifacts) plus raw nodes/edges/counts.',
						'- `diagram_erd` and `diagram_proposals` are pure passthroughs: pass the data, get the mermaid. The diagram tool never reads the DB or the registry.',
						'- Only edges between same-workspace packages / package files are drawn; external deps are dropped.',
						'- Offline and pure — no external tools, no network.',
					].join('\n'),
				},
			],
		};
	},
});
