import { definePlugin } from '@mcp-vertex/core/public';

import { createGitRunner } from './lib/git';
import { buildGitToolRegistrations } from './lib/tools';

/**
 * Read-only git orientation. Exposes status / changed / diff / log as
 * structured JSON so any agent sees what changed cheaply, in any repo.
 * Load with `mcp-vertex --plugins=git`.
 */
export default definePlugin({
	name: 'git',
	version: '0.1.0',
	describe:
		'Read-only git orientation: status, changed files, diff stat and recent log as structured JSON.',
	register(ctx) {
		return {
			tools: buildGitToolRegistrations({
				namespacePrefix: ctx.namespacePrefix,
				run: createGitRunner(ctx.workspace.root),
			}),
			knowledge: [
				{
					id: 'git-orientation',
					title: 'Git orientation',
					body: [
						'# Git orientation',
						'',
						`Tools: \`${ctx.namespacePrefix}_status\` / \`_changed\` / \`_diff\` / \`_log\` (all read-only).`,
						'',
						'- Start a turn with `git_changed` to see what you touched, cheaply.',
						'- Use `git_diff` (--stat) before composing a commit message; write the message yourself.',
						'- These tools never modify the repo (no add/commit/push).',
					].join('\n'),
				},
			],
		};
	},
});
