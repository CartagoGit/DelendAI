/**
 * `<prefix>_setup_github` — guided setup for the issues plugin (f00030 S2).
 *
 * Detects the repo, the GitHub auth tier and whether the plugin is
 * already configured, then returns a paste-ready markdown guide plus the
 * structured context. Read-only: it advises, it never writes the config
 * or touches GitHub. The detection probes are injected
 * (`IGithubSetupDeps`) so the tool is unit-testable; production probes
 * (git/gh/env/fs) are wired by `createGithubSetupDeps` in the plugin's
 * `register`.
 */
import { z } from 'zod';

import type { IToolRegistration } from '@mcp-vertex/core/public';
import { toolOk } from '@mcp-vertex/core/public';

import { runSetupGithub, type IGithubSetupDeps } from '../github-setup';

const SETUP_GITHUB_OUTPUT_SCHEMA = z.object({
	ok: z.boolean(),
	repo: z.string().nullable(),
	tier: z.enum(['gh', 'token', 'anon']),
	configured: z.boolean(),
	steps: z.array(
		z.object({
			id: z.string(),
			title: z.string(),
			detail: z.string(),
			command: z.string().optional(),
			optional: z.boolean().optional(),
		}),
	),
	guide: z.string(),
});

export interface ISetupGithubToolOptions {
	readonly namespacePrefix: string;
	readonly deps: IGithubSetupDeps;
}

export const runSetupGithubTool = (options: ISetupGithubToolOptions) => {
	const result = runSetupGithub(options.deps);
	return toolOk({
		repo: result.context.repo,
		tier: result.context.tier,
		configured: result.context.configured,
		steps: result.steps,
		guide: result.guide,
	});
};

export const buildSetupGithubRegistration = (
	options: ISetupGithubToolOptions,
): IToolRegistration => ({
	id: 'setup_github',
	tags: ['issues', 'setup'],
	summary: 'Guided setup for the issues plugin (repo + auth tier + config).',
	register: async (server) => {
		server.registerTool(
			`${options.namespacePrefix}_setup_github`,
			{
				outputSchema: SETUP_GITHUB_OUTPUT_SCHEMA,
				description:
					'Detect the GitHub repo, auth tier (gh > token > anon) and whether the issues plugin is configured, and return a paste-ready setup guide. Read-only — it never writes config or calls GitHub.',
				inputSchema: z.object({}),
			},
			async () => runSetupGithubTool(options),
		);
	},
});
