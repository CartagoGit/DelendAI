import {
	DEFAULT_CONFIG_FILENAME,
	definePlugin,
	resolveWorkspaceContained,
} from '@mcp-vertex/core/public';
import { z } from 'zod';

import { createGithubSetupDeps } from './lib/github-setup';
import { fetchIssue, listIssues } from './lib/github-client';
import type { IGithubClient } from './lib/tools';
import { buildIssuesToolRegistrations } from './lib/tools';
import { buildSetupGithubRegistration } from './lib/tools/setup-github.tool';

/** Default scaffold directory (workspace-relative), per the proposal's S3 spec. */
const DEFAULT_SCAFFOLD_DIR = 'docs/mcp-vertex/proposals/retired/issues';

/** Adapts the real `fetchIssue`/`listIssues` free functions (S2) into the `IGithubClient` port the tools depend on. */
const createGithubClient = (repo: string): IGithubClient => ({
	fetchIssue: (number: number) => fetchIssue(repo, number),
	listIssues: (opts) => listIssues(repo, opts ?? {}),
});

/**
 * Knowledge entry surfaced when the plugin loads with `--plugins=proposals,issues`
 * but `plugins.issues.options.repo` is not set in `mcp-vertex.config.json`.
 * Without this entry, the user would see `issues_*` silently missing from
 * `mcp-vertex_overview` and have to read the code to discover the reason.
 * Surfacing the entry as a discoverable knowledge item makes the failure
 * mode self-documenting and one `mcp-vertex_knowledge` call away.
 */
const ISSUES_NEEDS_SETUP_BODY = [
	'# issues plugin — repo not configured',
	'',
	'`plugins/issues` is loaded but `plugins.issues.options.repo` is missing.',
	'',
	'Pick one of two paths:',
	'',
	'1. **Interactive (recommended for first-time setup)**: run the `setup-github` subcommand once. It detects the repo from `git remote get-url origin`, asks you to confirm, and writes the config atomically.',
	'',
	'   ```bash',
	'   mcp-vertex setup-github',
	'   ```',
	'',
	'2. **Manual**: edit `mcp-vertex.config.json` and add',
	'',
	'   ```jsonc',
	'   {',
	'     "plugins": {',
	'       "issues": { "options": { "repo": "<owner>/<name>" } }',
	'     }',
	'   }',
	'   ```',
	'',
	'Restart the host after either change.',
].join('\n');

/**
 * Opt-in GitHub issues plugin. Host-only, single-user productivity
 * tool (same shape as `plugins/logs` / `plugins/web-fetch`): not part
 * of the `swarm` preset, never loaded unless the user explicitly adds
 * `proposals,issues` to `--plugins` or `mcp-vertex.config.json`.
 *
 * `dependsOn: ['proposals']` is a HARD requirement, not a soft
 * coupling — every `issues_*` tool reads/writes scaffold files under
 * `docs/mcp-vertex/proposals/retired/issues/**`, which is part of the `proposals`
 * plugin's managed namespace (see the proposal's "why this design"
 * section). The loader
 * (`packages/core/src/lib/plugins/load-plugins.ts`) refuses to
 * register `issues` at all if `proposals` is not in the same load
 * set — no partial registration, no silently broken tools.
 *
 * The 5 `issues_*` tools (list/fetch/ingest/analyze/resolve) register
 * conditionally on the `repo` option being set; without it, the
 * plugin returns an `IKnowledgeEntry` (`issues-needs-repo-config`) so the
 * host agent can discover the missing-config situation via
 * `mcp-vertex_overview` or `mcp-vertex_knowledge`.
 */
export default definePlugin({
	name: 'issues',
	version: '0.1.0',
	describe:
		'REQUIRES proposals plugin. Opt-in GitHub issues ingest/analyse/promote workflow — host-only, not in the swarm preset.',
	dependsOn: ['proposals'],
	optionsSchema: z.object({
		/** `'owner/name'`; required to register the 5 `issues_*` tools. */
		repo: z.string().optional(),
		/** Defaults to `docs/mcp-vertex/proposals/retired/issues`. */
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

		// f00030 S2: the setup-github guide is available regardless of
		// whether `repo` is configured — its whole point is to help the
		// user reach a configured state.
		const setupGithubTool = buildSetupGithubRegistration({
			namespacePrefix: ctx.namespacePrefix,
			deps: createGithubSetupDeps(
				ctx.workspace.root,
				DEFAULT_CONFIG_FILENAME,
				repo !== undefined,
			),
		});

		if (repo === undefined) {
			// No `repo` configured: register only the setup helper + a
			// discoverable knowledge entry instead of throwing at boot.
			// The contract: the rest of the plugin surface stays green
			// (CI smoke, `--check`), and any agent that boots the server
			// sees the hint via `mcp-vertex_overview` (lists knowledge
			// ids) or via a direct `mcp-vertex_knowledge` call.
			return {
				tools: [setupGithubTool],
				knowledge: [
					{
						id: 'issues-needs-repo-config',
						title: 'issues plugin needs `repo` configured',
						body: ISSUES_NEEDS_SETUP_BODY,
					},
				],
			};
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

		return { tools: [...tools, setupGithubTool] };
	},
});
