import { definePlugin } from '@mcp-vertex/core/public';
import { z } from 'zod';

import { createGitRunner } from './lib/services/git';
import { buildGitToolRegistrations } from './lib/tools';
import { buildGitWriteToolRegistrations } from './lib/tools/write-tools';

/**
 * Read-only git orientation, PLUS opt-in write tools. Exposes
 * status / changed / diff / log / blame / show / worktree as structured
 * JSON so any agent sees what changed cheaply, in any repo. Load with
 * `mcp-vertex --plugins=git`.
 *
 * `git_commit`/`git_push` are NOT registered by default — they break the
 * plugin's read-only posture (f00020 R1), so a host must opt in
 * explicitly via `{ "plugins": { "git": { "options": { "allowWrite": true } } } }`
 * in `mcp-vertex.config.json`. Mirrors the same `options.allowWrite`
 * gate used by other write-capable plugins in this repo.
 */

/**
 * r00003 S9 (F7, O + L + I): explicit zod schema for the git plugin's
 * options. Replaces the implicit `ctx.options.allowWrite` read on an
 * untyped bag so a host misconfig (e.g. `allowWrite: "true"`) is rejected
 * up front instead of silently treated as falsy.
 */
const OptionsSchema = z.object({
	allowWrite: z.boolean().optional(),
});

export default definePlugin({
	name: 'git',
	version: '0.1.0',
	describe:
		'Read-only git orientation: status, changed files, diff stat, recent log, blame, show and worktree list as structured JSON. Optional (opt-in) write tools: commit and push.',
	optionsSchema: OptionsSchema,
	register(ctx) {
		const parsed = OptionsSchema.safeParse(ctx.options ?? {});
		if (!parsed.success) {
			throw new Error(
				`git plugin rejected its options: ${parsed.error.message}`,
			);
		}
		const run = createGitRunner(ctx.workspace.root);
		const allowWrite = parsed.data.allowWrite === true;
		const readTools = buildGitToolRegistrations({
			namespacePrefix: ctx.namespacePrefix,
			run,
		});
		const writeTools = allowWrite
			? buildGitWriteToolRegistrations({
					namespacePrefix: ctx.namespacePrefix,
					run,
				})
			: [];
		return {
			tools: [...readTools, ...writeTools],
			knowledge: [
				{
					id: 'git-orientation',
					title: 'Git orientation',
					body: [
						'# Git orientation',
						'',
						`Tools: \`${ctx.namespacePrefix}_status\` / \`_changed\` / \`_diff\` / \`_log\` / \`_blame\` / \`_show\` / \`_worktree\` (all read-only).`,
						'',
						'- Start a turn with `git_changed` to see what you touched, cheaply.',
						'- Use `git_diff` (--stat) before composing a commit message; write the message yourself.',
						"- `git_blame` explains who/when for a file (optionally one line range); `git_show` gives a commit's metadata + --stat without the full patch.",
						'- `git_worktree` only lists existing worktrees — to create/remove a per-agent one use `proposals_agent_worktree`.',
						'- These read-only tools never modify the repo (no add/commit/push).',
						...(allowWrite
							? [
									'',
									`- \`${ctx.namespacePrefix}_commit\` / \`${ctx.namespacePrefix}_push\` are enabled (write effect): commit messages must use a Conventional Commit prefix; \`--amend\` is refused unless the last commit author matches the calling agent; push to a protected branch (main/master) is refused; \`force: "with-lease"\` is the only supported force mode (never plain --force by default).`,
								]
							: [
									'',
									'- Write tools (`_commit`/`_push`) are disabled by default. A host opts in via `{"plugins":{"git":{"options":{"allowWrite":true}}}}`.',
								]),
					].join('\n'),
				},
			],
		};
	},
});
