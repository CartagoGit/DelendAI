/**
 * github-setup.ts — GitHub setup detection + guide composition (f00030 S2).
 *
 * Detects the three inputs the agnostic core step-engine needs — the
 * repo (from `git remote get-url origin`), the auth tier (`gh` CLI >
 * `GITHUB_TOKEN` > anonymous), and whether the issues plugin is already
 * declared in `mcp-vertex.config.json` — then composes the core
 * `buildGithubSetupSteps` + `renderCrossProjectGuide` into one result.
 *
 * All side-effecting probes are injected (`IGithubSetupDeps`) so the
 * detection is unit-testable without a git repo, a `gh` binary, or env.
 * The `setup-github` MCP tool and (via the same core engine) the CLI
 * subcommand emit identical guidance.
 */
import {
	buildGithubSetupSteps,
	renderCrossProjectGuide,
	type GithubAuthTier,
	type IGithubSetupContext,
	type ISetupStep,
} from '@mcp-vertex/core/public';

export interface IGithubSetupDeps {
	/** Raw `git remote get-url origin` output (or null if not a repo / no origin). */
	readonly originUrl: () => string | null;
	/** True when the `gh` CLI is available + authenticated. */
	readonly hasGhCli: () => boolean;
	/** Value of `GITHUB_TOKEN` (or undefined). */
	readonly githubToken: () => string | undefined;
	/** Raw `mcp-vertex.config.json` text (or undefined when absent). */
	readonly readConfig: () => string | undefined;
	/** Workspace-relative config path, for the guide header. */
	readonly configPath: string;
}

export interface IGithubSetupResult {
	readonly context: IGithubSetupContext;
	readonly steps: readonly ISetupStep[];
	readonly guide: string;
}

/**
 * Parse `owner/name` from a git remote URL (https or ssh form). Returns
 * null when the URL is not a GitHub remote. Pure.
 */
export const parseGithubRepo = (originUrl: string | null): string | null => {
	if (originUrl === null) return null;
	const trimmed = originUrl.trim();
	// git@github.com:owner/name.git  |  https://github.com/owner/name(.git)
	const match = trimmed.match(/github\.com[/:]([^/]+)\/([^/]+?)(?:\.git)?$/u);
	if (match === null) return null;
	return `${match[1]}/${match[2]}`;
};

/** Resolve the auth tier from the available signals (gh ≫ token ≫ anon). */
export const resolveTier = (
	hasGhCli: boolean,
	token: string | undefined,
): GithubAuthTier => {
	if (hasGhCli) return 'gh';
	if (token !== undefined && token.trim() !== '') return 'token';
	return 'anon';
};

/** True when the config text declares `plugins.issues`. */
export const isIssuesConfigured = (configText: string | undefined): boolean => {
	if (configText === undefined) return false;
	try {
		const parsed = JSON.parse(configText) as {
			plugins?: Record<string, unknown>;
		};
		return parsed.plugins !== undefined && 'issues' in parsed.plugins;
	} catch {
		return false;
	}
};

/**
 * Production probe factory: wires the real side effects (git remote via
 * `Bun.spawnSync`, `gh auth status`, `GITHUB_TOKEN`) behind the
 * injectable `IGithubSetupDeps` port. `configured` is passed in (the
 * plugin already knows it from `ctx.options.repo`) rather than read from
 * disk — keeping the plugin free of sync `node:fs` calls (plugin
 * drift-budget) and reflecting the LIVE loaded state, not a stale file.
 * Kept separate from the pure functions above so the engine stays
 * unit-testable.
 */
export const createGithubSetupDeps = (
	repoRoot: string,
	configPath: string,
	configured: boolean,
): IGithubSetupDeps => {
	const spawn = (cmd: string[]): { ok: boolean; out: string } => {
		try {
			const res = Bun.spawnSync(cmd, { cwd: repoRoot });
			return {
				ok: res.exitCode === 0,
				out: res.stdout.toString().trim(),
			};
		} catch {
			return { ok: false, out: '' };
		}
	};
	return {
		originUrl: () => {
			const res = spawn(['git', 'remote', 'get-url', 'origin']);
			return res.ok && res.out !== '' ? res.out : null;
		},
		hasGhCli: () => spawn(['gh', 'auth', 'status']).ok,
		githubToken: () => process.env.GITHUB_TOKEN,
		// Synthesised from the known load state — no file read in the plugin.
		readConfig: () =>
			configured ? '{"plugins":{"issues":{"options":{}}}}' : undefined,
		configPath,
	};
};

/**
 * Detect the setup context and compose the full guide. Pure given the
 * injected `deps` (no direct git/gh/fs/env access here).
 */
export const runSetupGithub = (deps: IGithubSetupDeps): IGithubSetupResult => {
	const context: IGithubSetupContext = {
		repo: parseGithubRepo(deps.originUrl()),
		tier: resolveTier(deps.hasGhCli(), deps.githubToken()),
		configured: isIssuesConfigured(deps.readConfig()),
		configPath: deps.configPath,
	};
	const steps = buildGithubSetupSteps(context);
	return { context, steps, guide: renderCrossProjectGuide(context, steps) };
};
