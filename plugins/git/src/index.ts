import { definePlugin } from '@delendai/core/public';
import type { IPluginEffectsCapability } from '@delendai/core/public';
import z from 'zod';

import { createGitRunner } from './lib/services/git';
import { buildGitToolRegistrations } from './lib/tools';
import { buildGitWriteToolRegistrations } from './lib/tools/write-tools';
import { buildGitForgeToolRegistrations } from './lib/tools/forge-tools';
import { buildGitExtendedToolRegistrations } from './lib/tools/git-extended.tool';

/**
 * Narrow `ctx.effects` to a concrete value or throw. The write tools'
 * ENTIRE dry-run guarantee rests on running through
 * `ctx.effects.git` (see `write-tools.ts`) instead of a plain
 * `IGitRunner` — silently falling back to one when the host omitted
 * `ctx.effects` would look like the guarantee still holds when it does
 * not, so this refuses loudly instead.
 */
const requireEffects = (
	effects: IPluginEffectsCapability | undefined,
): IPluginEffectsCapability => {
	if (effects === undefined) {
		throw new Error(
			'git plugin: allowWrite is enabled but the host did not supply ctx.effects — refusing to register unguarded write tools.',
		);
	}
	return effects;
};

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
	allowForge: z.boolean().optional(),
	allowStash: z.boolean().optional(),
});

export default definePlugin({
	name: 'git',
	version: '0.1.1',
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
		const allowForge = parsed.data.allowForge === true;
		const allowStash = parsed.data.allowStash === true;
		const readTools = buildGitToolRegistrations({
			namespacePrefix: ctx.namespacePrefix,
			run,
		});
		// Write tools MUST run
		// through the host's dry-run-gated `ctx.effects.git`, never the
		// plain `run` above — that is what makes `dryRun: true` refuse the
		// mutation even if `runGitCommit`/`runGitPush` never look at the
		// flag themselves. Fail closed rather than silently falling back
		// to the unguarded runner: a host that wires `allowWrite: true`
		// without wiring `ctx.effects` has a broken capability contract,
		// not a reason to run unprotected.
		const writeTools = allowWrite
			? buildGitWriteToolRegistrations({
					namespacePrefix: ctx.namespacePrefix,
					run: requireEffects(ctx.effects).git,
					commitAuthor: ctx.commitAuthor,
				})
			: [];
		const forgeTools = allowForge
			? buildGitForgeToolRegistrations({
					namespacePrefix: ctx.namespacePrefix,
					workspaceRootAbs: ctx.workspace.root,
				})
			: [];
		const extendedTools = allowStash
			? buildGitExtendedToolRegistrations({
					namespacePrefix: ctx.namespacePrefix,
					workspaceRootAbs: ctx.workspace.root,
				})
			: [];
		return {
			tools: [
				...readTools,
				...writeTools,
				...forgeTools,
				...extendedTools,
			],
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
						'',
						'- **Definition of done:** a finished task ends with its changes committed and pushed under the configured author identity — never leave completed work uncommitted and never ask the user whose name to use (the author is resolved centrally).',
						...(allowWrite
							? [
									'',
									`- Commit with \`${ctx.namespacePrefix}_commit\` (Conventional Commit message) and push with \`${ctx.namespacePrefix}_push\` at the end of every task.`,
									`- \`${ctx.namespacePrefix}_commit\` / \`${ctx.namespacePrefix}_push\` (write effect): commit messages must use a Conventional Commit prefix; \`--amend\` is refused unless the last commit author matches the calling agent; push to a protected branch (main/master) is refused; \`force: "with-lease"\` is the only supported force mode (never plain --force by default).`,
								]
							: [
									'',
									'- Write tools (`_commit`/`_push`) are disabled by default. A host opts in via `{"plugins":{"git":{"options":{"allowWrite":true}}}}`; until then, commit/push through the proposals persist step or the host shell — still do not leave completed work uncommitted.',
								]),
					].join('\n'),
				},
			],
		};
	},
});
