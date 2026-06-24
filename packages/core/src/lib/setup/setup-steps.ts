/**
 * setup-steps.ts — agnostic setup-step engine (f00030 S2).
 *
 * A pure builder that turns a detected GitHub-issues setup *context*
 * into an ordered list of `ISetupStep`s. It knows nothing about HOW the
 * context was detected (git remote parsing, `gh`/token probing) — that
 * lives in the caller (the CLI subcommand or the issues plugin's
 * `github-setup.ts`). Both feed the same engine so the CLI and the MCP
 * tool emit identical guidance (Single Source of Truth).
 *
 * SOLID: one responsibility (context → steps); open/closed (a new step
 * is a new entry, no edit to consumers); dependency inversion (consumers
 * depend on `ISetupStep`, not on the detection internals).
 */

/** GitHub auth tier, ordered by rate limit (gh ≫ token ≫ anon). */
export type GithubAuthTier = 'gh' | 'token' | 'anon';

/** Everything the step engine needs, already detected by the caller. */
export interface IGithubSetupContext {
	/** `owner/name`, or `null` when it could not be derived. */
	readonly repo: string | null;
	/** Which auth tier is currently available. */
	readonly tier: GithubAuthTier;
	/** True when `mcp-vertex.config.json` already declares the issues plugin. */
	readonly configured: boolean;
	/** Workspace-relative config path (for the "edit this file" step). */
	readonly configPath: string;
}

/** One actionable setup step. `command` is a copy-pasteable shell/JSON line. */
export interface ISetupStep {
	readonly id: string;
	readonly title: string;
	readonly detail: string;
	readonly command?: string;
	/** Optional steps can be skipped without breaking the flow. */
	readonly optional?: boolean;
}

const authStep = (ctx: IGithubSetupContext): ISetupStep | undefined => {
	if (ctx.tier === 'gh') return undefined; // already best tier
	if (ctx.tier === 'token') {
		return {
			id: 'auth',
			title: 'GitHub token detected (5000 req/h)',
			detail: 'A GITHUB_TOKEN is set. For the highest limit and the simplest auth, `gh auth login` is still recommended.',
			command: 'gh auth login',
			optional: true,
		};
	}
	return {
		id: 'auth',
		title: 'Authenticate with GitHub (raises the rate limit)',
		detail: 'Anonymous access is capped at 60 req/h. Authenticate with the GitHub CLI, or export a GITHUB_TOKEN, before ingesting issues.',
		command: 'gh auth login   # or: export GITHUB_TOKEN=<your-token>',
	};
};

const configStep = (ctx: IGithubSetupContext): ISetupStep => {
	const repo = ctx.repo ?? '<owner>/<name>';
	return {
		id: 'config',
		title: ctx.configured
			? 'Confirm the issues plugin config'
			: `Add the issues plugin to ${ctx.configPath}`,
		detail: `Declare the repo the issues plugin reads. ${
			ctx.configured
				? 'It is already present — verify the repo is correct.'
				: 'mcp-vertex never loads issues unless you opt in here.'
		}`,
		command: JSON.stringify(
			{ plugins: { issues: { options: { repo } } } },
			null,
			2,
		),
	};
};

const loadStep = (): ISetupStep => ({
	id: 'load',
	title: 'Load the host with the issues plugin',
	detail: 'Ensure the issues plugin is loaded along with any required dependencies.',
	command: 'mcp-vertex --plugins=issues',
});

const verifyStep = (): ISetupStep => ({
	id: 'verify',
	title: 'Verify the setup',
	detail: 'List open issues to confirm the repo + auth tier resolve.',
	command: 'mcpv issues list   # or call the issues_list MCP tool',
});

/**
 * Build the ordered GitHub-issues setup steps for a detected context.
 * The auth step is included only when it adds value (skipped on the
 * `gh` tier); everything else is always present.
 */
export const buildGithubSetupSteps = (
	ctx: IGithubSetupContext,
): readonly ISetupStep[] => {
	const auth = authStep(ctx);
	return [
		...(auth !== undefined ? [auth] : []),
		configStep(ctx),
		loadStep(),
		verifyStep(),
	];
};
