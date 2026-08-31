import { definePlugin } from '@mcp-vertex/core/public';
import z from 'zod';

import { buildForgeReadToolRegistrations } from './lib/tools/forge-read.tool';
import { buildForgeReleaseToolRegistrations } from './lib/tools/forge-release.tool';
import { buildForgeSearchToolRegistrations } from './lib/tools/forge-search.tool';
import { buildForgeWriteToolRegistrations } from './lib/tools/forge-write.tool';

/**
 * Release-cycle configuration the host can override at plugin
 * registration time. The defaults match the repository-level
 * contract (`release/**` → `main`, integration via `develop`).
 *
 * Hosts in any other repository can override these to align with
 * their branch layout. The PR contract (`release-pr`) reads these
 * values to enforce `release/** → releaseTargetBranch` and reject
 * PRs against `integrationBranch`.
 */
const ReleaseCycleOptions = z
	.object({
		releaseSourceBranch: z.string().min(1).optional(),
		releaseTargetBranch: z.string().min(1).optional(),
		integrationBranch: z.string().min(1).optional(),
		remote: z.string().min(1).optional(),
	})
	.strict();

const OptionsSchema = z
	.object({
		defaultTimeoutMs: z.number().int().positive().max(120000).optional(),
		releaseCycle: ReleaseCycleOptions.optional(),
	})
	.strict();

export default definePlugin({
	name: 'forge',
	version: '0.1.1',
	describe:
		"GitHub/GitLab forge surface: PRs, issues, CI, releases and remote code search via the host's authenticated gh/glab CLI.",
	optionsSchema: OptionsSchema,
	register(ctx) {
		const parsed = OptionsSchema.safeParse(ctx.options ?? {});
		if (!parsed.success) {
			throw new Error(
				`forge plugin rejected its options: ${parsed.error.message}`,
			);
		}
		const cycle = {
			...(parsed.data.releaseCycle?.releaseSourceBranch !== undefined
				? {
						releaseSourceBranch:
							parsed.data.releaseCycle.releaseSourceBranch,
					}
				: {}),
			...(parsed.data.releaseCycle?.releaseTargetBranch !== undefined
				? {
						releaseTargetBranch:
							parsed.data.releaseCycle.releaseTargetBranch,
					}
				: {}),
			...(parsed.data.releaseCycle?.integrationBranch !== undefined
				? {
						integrationBranch:
							parsed.data.releaseCycle.integrationBranch,
					}
				: {}),
			...(parsed.data.releaseCycle?.remote !== undefined
				? { remote: parsed.data.releaseCycle.remote }
				: {}),
		};
		const readTools = buildForgeReadToolRegistrations({
			namespacePrefix: ctx.namespacePrefix,
			workspaceRootAbs: ctx.workspace.root,
			...(parsed.data.defaultTimeoutMs !== undefined
				? { defaultTimeoutMs: parsed.data.defaultTimeoutMs }
				: {}),
		});
		const writeTools = buildForgeWriteToolRegistrations({
			namespacePrefix: ctx.namespacePrefix,
			workspaceRootAbs: ctx.workspace.root,
			...(parsed.data.defaultTimeoutMs !== undefined
				? { defaultTimeoutMs: parsed.data.defaultTimeoutMs }
				: {}),
		});
		const releaseTools = buildForgeReleaseToolRegistrations({
			namespacePrefix: ctx.namespacePrefix,
			workspaceRootAbs: ctx.workspace.root,
			...(parsed.data.defaultTimeoutMs !== undefined
				? { timeoutMs: parsed.data.defaultTimeoutMs }
				: {}),
		});
		// x00190 follow-up: implemented since this plugin's original slice
		// but never wired into the tools array — search_code was
		// completely unreachable by any host.
		const searchTools = buildForgeSearchToolRegistrations({
			namespacePrefix: ctx.namespacePrefix,
			workspaceRootAbs: ctx.workspace.root,
		});
		return {
			tools: [
				...readTools,
				...writeTools,
				...releaseTools,
				...searchTools,
			],
			knowledge: [
				{
					id: 'forge-surface',
					title: 'Forge surface',
					body: [
						'# Forge surface',
						'',
						`Read tools: \`${ctx.namespacePrefix}_pr_list\` / \`${ctx.namespacePrefix}_pr_show\` / \`${ctx.namespacePrefix}_ci_status\` / \`${ctx.namespacePrefix}_issue_list\` / \`${ctx.namespacePrefix}_issue_show\`.`,
						`Write tools: \`${ctx.namespacePrefix}_pr_create\` / \`${ctx.namespacePrefix}_pr_comment\` / \`${ctx.namespacePrefix}_issue_create\` (each its own tool, not a kind discriminator).`,
						`For mcp-vertex-owned errors or defects, use \`${ctx.namespacePrefix}_mcp_vertex_issue_create\`; it always posts to \`CartagoGit/mcp-vertex\` and ignores the consuming project's origin.`,
						`Release tool: \`${ctx.namespacePrefix}_release\` — creates a release from an existing tag.`,
						`Search tool: \`${ctx.namespacePrefix}_search_code\` — read-only remote code search.`,
						'',
						'- Provider is auto-detected from the `origin` remote.',
						"- The plugin wraps the host's existing `gh`/`glab` auth; it never stores or prompts for a PAT.",
						'- Missing CLI yields an install hint instead of a crash.',
						'- Every write action requires an explicit `confirm:true` and returns a structured refusal envelope when the flag is absent or false.',
						'- Remote code search is read-only; release creation is consent-gated and reuses the same bounded/redacted CLI seam.',
						'',
						'## Release contract (default)',
						'',
						'- PRs MUST originate on `release/<type>/<slug>` and target `main`.',
						'- PRs against `develop` (or any configured integration branch) are rejected with `integration-base-forbidden`.',
						'- The release branch is cut from `develop`, merged back into `develop` (`mergeReleaseFixToIntegration`) and rehydrated into `develop` (`rehydrateIntegrationFromRelease`) without opening PRs.',
						'- Hosts can override `releaseSourceBranch`, `releaseTargetBranch`, `integrationBranch`, and `remote` via the `releaseCycle` plugin option.',
					].join('\n'),
				},
			],
		};
	},
});
