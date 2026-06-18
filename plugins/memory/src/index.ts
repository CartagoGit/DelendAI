import { definePlugin, joinRel } from '@mcp-vertex/core/public';

import { buildMemoryToolRegistrations } from './lib/tools';


/**
 * Persistent project memory. Save/recall/list/forget small notes stored
 * in one JSON file under the cache dir, so any agent keeps continuity
 * across sessions with minimal tokens. Load with `mcp-vertex --plugins=memory`.
 */
export default definePlugin({
	name: 'memory',
	version: '0.1.0',
	describe:
		'Persistent project notes (save/recall/list/forget) for cross-session continuity with minimal tokens.',
	register(ctx) {
		const storePathAbs = ctx.workspace.resolve(
			joinRel(ctx.pluginCacheDir, 'notes.json')
		);
		return {
			tools: buildMemoryToolRegistrations({
				namespacePrefix: ctx.namespacePrefix,
				storePathAbs,
			}),
			knowledge: [
				{
					id: 'memory-usage',
					title: 'Project memory',
					body: [
						'# Project memory',
						'',
						`Tools: \`${ctx.namespacePrefix}_memory_save\` / \`_memory_recall\` / \`_memory_list\` / \`_memory_forget\`.`,
						'',
						'- Save durable facts an agent should remember next session: decisions, gotchas, where things live, conventions discovered.',
						'- `memory_save` upserts by title (no duplicates).',
						'- Recall only what you need (query/tags) — keep context small.',
						`- Notes persist in \`${joinRel(ctx.pluginCacheDir, 'notes.json')}\`.`,
					].join('\n'),
				},
			],
		};
	},
});
