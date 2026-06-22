import {
	definePlugin,
	resolveWorkspaceContained,
} from '@mcp-vertex/core/public';
import { z } from 'zod';

import { fetchIssue, listIssues } from './lib/github-client';
import type { IGithubClient } from './lib/tools';
import { buildIssuesToolRegistrations } from './lib/tools';

/** Default scaffold directory (workspace-relative), per the proposal's S3 spec. */
const DEFAULT_SCAFFOLD_DIR = 'docs/proposals/retired/issues';

/** Adapts the real `fetchIssue`/`listIssues` free functions (S2) into the `IGithubClient` port the tools depend on. */
const createGithubClient = (repo: string): IGithubClient => ({
	fetchIssue: (number: number) => fetchIssue(repo, number),
	listIssues: (opts) => listIssues(repo, opts ?? {}),
});

/**
 * Opt-in GitHub issues plugin. Host-only, single-user productivity
 * tool (same shape as `plugins/logs` / `plugins/web-fetch`): not part
 * of the `swarm` preset, never loaded unless the user explicitly adds
 * `proposals,issues` to `--plugins` or `mcp-vertex.config.json`.
 *
 * `dependsOn: ['proposals']` is a HARD requirement, not a soft
 * coupling — every `issues_*` tool reads/writes scaffold files under
 * `docs/proposals/retired/issues/**`, which is part of the `proposals`
 * plugin's managed namespace (see the proposal's "why this design"
 * section). The loader
 * (`packages/core/src/lib/plugins/load-plugins.ts`) refuses to
 * register `issues` at all if `proposals` is not in the same load
 * set — no partial registration, no silently broken tools.
 *
 * S1 registers the plugin skeleton only: `dependsOn` is declared and
 * enforced, but the 5 `issues_*` tools (list/fetch/ingest/analyze/
 * resolve) and the GitHub client land in S2/S3. Until then,
 * `register()` returns zero tools — a deliberate, inspectable
 * mid-state, not a bug.
 */
export default definePlugin({
	name: 'issues',
	version: '0.1.0',
	describe:
		'REQUIRES proposals plugin. Opt-in GitHub issues ingest/analyse/promote workflow — host-only, not in the swarm preset.',
	dependsOn: ['proposals'],
	optionsSchema: z.object({
		/** `'owner/name'`; defaults to `git remote get-url origin` (S2). */
		repo: z.string().optional(),
		/** Defaults to `docs/proposals/retired/issues` (S2/S3). */
		scaffoldDir: z.string().optional(),
	}),
	register(ctx) {
		const repo =
			typeof ctx.options.repo === 'string' &&
			ctx.options.repo.trim() !== ''
				? ctx.options.repo
				: undefined;
		const scaffoldDir =
			typeof ctx.options.scaffoldDir === 'string' &&
			ctx.options.scaffoldDir.trim() !== ''
				? ctx.options.scaffoldDir
				: DEFAULT_SCAFFOLD_DIR;

		if (repo === undefined) {
			// No `repo` configured: register zero tools rather than throwing
			// at boot — `mcp-vertex --check` and a bare `--plugins=issues`
			// smoke test should both succeed; the actual tool calls would
			// simply have nowhere to fetch from. The proposal's S2 mentions
			// deriving a default from `git remote get-url origin`; deferred to
			// a follow-up slice so S3 stays focused on the 5 tools.
			return { tools: [] };
		}

		const contained = resolveWorkspaceContained(
			ctx.workspace.root,
			scaffoldDir,
		);
		if (!contained.ok) {
			throw new Error(
				`plugin "issues": invalid scaffoldDir option: ${contained.reason}`,
			);
		}

		const githubClient = createGithubClient(repo);
		const tools = buildIssuesToolRegistrations({
			namespacePrefix: ctx.namespacePrefix,
			repo,
			scaffoldDirAbs: contained.abs,
			repoRoot: ctx.workspace.root,
			githubClient,
		});

		return { tools };
	},
});
