/**
 * setup-subcommand.ts — the `setup-github` CLI subcommand (f00030 S2).
 *
 * A thin shell over the agnostic core engine (`buildGithubSetupSteps` +
 * `renderCrossProjectGuide`): it detects the three inputs the engine
 * needs (repo, auth tier, whether issues is configured) and prints the
 * rendered guide. The detection probes are injected (`ISetupGithubCliDeps`)
 * so the subcommand is unit-testable without git/gh/fs/env; production
 * defaults are wired in `runSetupGithubSubcommand`.
 *
 * The issues plugin exposes the SAME guidance via its `setup_github` MCP
 * tool; both feed the one core engine so the output never diverges.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { renderCrossProjectGuide } from '../setup/cross-project-guide';
import {
	buildGithubSetupSteps,
	type GithubAuthTier,
	type IGithubSetupContext,
} from '../setup/setup-steps';

export interface ISetupGithubCliDeps {
	readonly originUrl: () => string | null;
	readonly hasGhCli: () => boolean;
	readonly githubToken: () => string | undefined;
	readonly readConfig: () => string | undefined;
	readonly configPath: string;
}

/** Parse `owner/name` from a github remote URL (https or ssh). Pure. */
export const parseGithubRepo = (originUrl: string | null): string | null => {
	if (originUrl === null) return null;
	const match = originUrl
		.trim()
		.match(/github\.com[/:]([^/]+)\/([^/]+?)(?:\.git)?$/u);
	return match === null ? null : `${match[1]}/${match[2]}`;
};

/** Resolve the auth tier (gh ≫ token ≫ anon). Pure. */
export const resolveTier = (
	hasGhCli: boolean,
	token: string | undefined,
): GithubAuthTier => {
	if (hasGhCli) return 'gh';
	if (token !== undefined && token.trim() !== '') return 'token';
	return 'anon';
};

/** True when the config text declares `plugins.issues`. Pure. */
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

/** Detect the context and render the guide. Pure given `deps`. */
export const buildSetupGithubReport = (
	deps: ISetupGithubCliDeps,
): { context: IGithubSetupContext; guide: string } => {
	const context: IGithubSetupContext = {
		repo: parseGithubRepo(deps.originUrl()),
		tier: resolveTier(deps.hasGhCli(), deps.githubToken()),
		configured: isIssuesConfigured(deps.readConfig()),
		configPath: deps.configPath,
	};
	return {
		context,
		guide: renderCrossProjectGuide(context, buildGithubSetupSteps(context)),
	};
};

const CONFIG_FILENAME = 'mcp-vertex.config.json';

/** Production probes: git remote, `gh auth status`, env, config read. */
const defaultDeps = (cwd: string): ISetupGithubCliDeps => {
	const spawn = (cmd: readonly string[]): { ok: boolean; out: string } => {
		try {
			const res = Bun.spawnSync(cmd, { cwd });
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
		readConfig: () => {
			const path = join(cwd, CONFIG_FILENAME);
			return existsSync(path) ? readFileSync(path, 'utf8') : undefined;
		},
		configPath: CONFIG_FILENAME,
	};
};

/** `mcp-vertex setup-github`: print the GitHub-issues setup guide. */
export const runSetupGithubSubcommand = async (
	_argv: readonly string[],
	cwd: string,
	deps: ISetupGithubCliDeps = defaultDeps(cwd),
): Promise<void> => {
	const { guide } = buildSetupGithubReport(deps);
	process.stdout.write(`${guide}\n`);
};
