/**
 * Talks to GitHub for one repo (`owner/name`, injected by the caller —
 * this module never reads `mcp-vertex.config.json` itself; that's the
 * plugin's `register()`, wired in a later slice).
 *
 * Single Responsibility: this module only knows how to fetch issue data
 * from GitHub, through three tiers of deterministic precedence (see the
 * proposal's "### 3.4 GitHub client strategy" section):
 *
 *   1. `gh` CLI (async argv spawn of `['gh', 'api', ...]`) — honours the
 *      user's `gh auth login`, 5000/h rate limit. Preferred path.
 *   2. REST API authenticated via `GITHUB_TOKEN` env — plain `fetch` to
 *      `api.github.com`, 5000/h rate limit.
 *   3. REST API anonymous — plain `fetch`, 60/h rate limit. The result
 *      tags `tier: 'rest-anon'` so the caller can warn the user.
 *
 * Each tier function returns `null` when it does not apply (e.g. no `gh`
 * binary, no `GITHUB_TOKEN`) or throws when it applies but the call
 * itself failed (e.g. `gh` is installed but returned a non-zero exit —
 * that's a real error, not "try the next tier silently"). The internal
 * orchestrator only falls through on `null`, not on thrown errors, so a
 * misconfigured `gh` doesn't mask itself behind a worse-rate-limited
 * anonymous fetch.
 *
 * No `octokit` dependency — deliberately, per the proposal's non-goals
 * (`packages/core` stays agnostic, and this plugin keeps its surface
 * area to an async argv spawn + native `fetch`).
 */

import { spawn as nodeSpawn } from 'node:child_process';

import type { ISpawn } from './contracts/interfaces/github-client.interface';
import type {
	IFetchFn,
	IFetchIssueResult,
	IGithubClientDeps,
	IIssueCreateInput,
	IIssueCreateResult,
	IListCodeScanningAlertsOptions,
	IListCodeScanningAlertsResult,
	IListDependabotAlertsOptions,
	IListDependabotAlertsResult,
	IListIssuesOptions,
	IListIssuesResult,
	IListSecretScanningAlertsOptions,
	IListSecretScanningAlertsResult,
	IListSecurityAdvisoriesOptions,
	IListSecurityAdvisoriesResult,
} from './contracts/interfaces/github-client-types.interface';
import type {
	IGithubComment,
	IGithubIssueDetail,
	IGithubIssueSummary,
} from './contracts/issue.types';
import type {
	ICodeScanningAlertSummary,
	IDependabotAlertSummary,
	ISecretScanningAlertSummary,
	ISecurityAdvisorySummary,
} from './contracts/interfaces/security.interface';

export type { ISpawn } from './contracts/interfaces/github-client.interface';

const EXIT_CODE_COMMAND_NOT_FOUND = 127;
const EXIT_CODE_CANNOT_EXECUTE = 126;
const DEFAULT_LIST_PAGE_SIZE = 30;

const defaultSpawn: ISpawn = (cmd) =>
	new Promise((resolve) => {
		const [binary, ...args] = cmd;
		if (binary === undefined) {
			resolve({
				exitCode: EXIT_CODE_COMMAND_NOT_FOUND,
				stdout: new Uint8Array(),
				stderr: new TextEncoder().encode('empty argv'),
			});
			return;
		}
		const child = nodeSpawn(binary, args, {
			stdio: ['ignore', 'pipe', 'pipe'],
		});
		const out: Buffer[] = [];
		const err: Buffer[] = [];
		child.stdout?.on('data', (chunk: Buffer) => out.push(chunk));
		child.stderr?.on('data', (chunk: Buffer) => err.push(chunk));
		child.on('error', (error: NodeJS.ErrnoException) => {
			resolve({
				exitCode:
					error.code === 'ENOENT'
						? EXIT_CODE_COMMAND_NOT_FOUND
						: EXIT_CODE_CANNOT_EXECUTE,
				stdout: new Uint8Array(),
				stderr: new TextEncoder().encode(String(error)),
			});
		});
		child.on('close', (code) => {
			resolve({
				exitCode: code ?? 1,
				stdout: new Uint8Array(Buffer.concat(out)),
				stderr: new Uint8Array(Buffer.concat(err)),
			});
		});
	});

/** Resolve the effective async spawn from the injected deps. */
const resolveSpawn = (deps: IGithubClientDeps): ISpawn => {
	if (deps.spawn !== undefined) return deps.spawn;
	const legacy = deps.spawnSync;
	if (legacy !== undefined) return (cmd) => Promise.resolve(legacy(cmd));
	return defaultSpawn;
};

const decode = (bytes: Uint8Array): string => new TextDecoder().decode(bytes);

// ---------------------------------------------------------------------------
// Raw GitHub REST shapes (subset of fields we read).
// ---------------------------------------------------------------------------

interface IRawLabel {
	readonly name: string;
}

interface IRawUser {
	readonly login: string;
}

interface IRawIssue {
	readonly number: number;
	readonly title: string;
	readonly state: 'open' | 'closed';
	readonly labels: readonly (IRawLabel | string)[];
	readonly user: IRawUser | null;
	readonly html_url: string;
	readonly created_at: string;
	readonly updated_at: string;
	readonly comments: number;
	readonly body?: string | null;
}

interface IRawComment {
	readonly user: IRawUser | null;
	readonly body: string | null;
	readonly created_at: string;
	readonly html_url: string;
}

const labelName = (l: IRawLabel | string): string =>
	typeof l === 'string' ? l : l.name;

const toSummary = (raw: IRawIssue): IGithubIssueSummary => ({
	number: raw.number,
	title: raw.title,
	state: raw.state,
	labels: raw.labels.map(labelName),
	author: raw.user?.login ?? 'unknown',
	url: raw.html_url,
	createdAt: raw.created_at,
	updatedAt: raw.updated_at,
	commentsCount: raw.comments,
});

const toDetail = (
	raw: IRawIssue,
	comments: readonly IGithubComment[],
): IGithubIssueDetail => ({
	...toSummary(raw),
	body: raw.body ?? '',
	comments,
});

const toComment = (raw: IRawComment): IGithubComment => ({
	author: raw.user?.login ?? 'unknown',
	body: raw.body ?? '',
	createdAt: raw.created_at,
	url: raw.html_url,
});

// ---------------------------------------------------------------------------
// Tier 1: gh CLI
// ---------------------------------------------------------------------------

/** Returns `null` when the `gh` binary is not available; throws on a real `gh` failure. */
const tryGhApi = async (
	spawnFn: ISpawn,
	path: string,
): Promise<unknown | null> => {
	const result = await spawnFn(['gh', 'api', path]);
	if (result.exitCode === EXIT_CODE_COMMAND_NOT_FOUND) return null;
	const stderr = decode(result.stderr);
	if (
		result.exitCode !== 0 &&
		/not found|command not found|no such file/i.test(stderr)
	) {
		return null;
	}
	if (result.exitCode !== 0) {
		throw new Error(
			`gh api ${path} failed: ${stderr.trim() || `exit ${result.exitCode}`}`,
		);
	}
	return JSON.parse(decode(result.stdout));
};

const tryGhFetchIssue = async (
	spawnFn: ISpawn,
	repo: string,
	number: number,
): Promise<{
	data: IGithubIssueDetail;
	comments: readonly IGithubComment[];
} | null> => {
	const issueRaw = await tryGhApi(spawnFn, `repos/${repo}/issues/${number}`);
	if (issueRaw === null) return null;
	const commentsRaw = await tryGhApi(
		spawnFn,
		`repos/${repo}/issues/${number}/comments`,
	);
	const comments = Array.isArray(commentsRaw)
		? (commentsRaw as IRawComment[]).map(toComment)
		: [];
	return { data: toDetail(issueRaw as IRawIssue, comments), comments };
};

const tryGhListIssues = async (
	spawnFn: ISpawn,
	repo: string,
	opts: IListIssuesOptions,
): Promise<readonly IGithubIssueSummary[] | null> => {
	const params = new URLSearchParams();
	params.set('state', opts.state ?? 'open');
	if (opts.labels && opts.labels.length > 0) {
		params.set('labels', opts.labels.join(','));
	}
	params.set('per_page', String(opts.limit ?? DEFAULT_LIST_PAGE_SIZE));
	const path = `repos/${repo}/issues?${params.toString()}`;
	const raw = await tryGhApi(spawnFn, path);
	if (raw === null) return null;
	if (!Array.isArray(raw)) return [];
	return (raw as IRawIssue[])
		.filter((i) => !('pull_request' in i))
		.map(toSummary);
};

// ---------------------------------------------------------------------------
// Tiers 2 & 3: REST (authed / anonymous)
// ---------------------------------------------------------------------------

const restGet = async (
	fetchFn: IFetchFn,
	path: string,
	token?: string,
): Promise<unknown> => {
	const headers: Record<string, string> = {
		Accept: 'application/vnd.github+json',
	};
	if (token) headers.Authorization = `Bearer ${token}`;
	const res = await fetchFn(`https://api.github.com/${path}`, { headers });
	if (!res.ok) {
		throw new Error(`GitHub REST ${path} failed: HTTP ${res.status}`);
	}
	return res.json();
};

const restFetchIssue = async (
	fetchFn: IFetchFn,
	repo: string,
	number: number,
	token?: string,
): Promise<{
	data: IGithubIssueDetail;
	comments: readonly IGithubComment[];
}> => {
	const issueRaw = (await restGet(
		fetchFn,
		`repos/${repo}/issues/${number}`,
		token,
	)) as IRawIssue;
	const commentsRaw = (await restGet(
		fetchFn,
		`repos/${repo}/issues/${number}/comments`,
		token,
	)) as IRawComment[];
	const comments = Array.isArray(commentsRaw)
		? commentsRaw.map(toComment)
		: [];
	return {
		data: toDetail(issueRaw, comments),
		comments,
	};
};

const restListIssues = async (
	fetchFn: IFetchFn,
	repo: string,
	opts: IListIssuesOptions,
	token?: string,
): Promise<readonly IGithubIssueSummary[]> => {
	const params = new URLSearchParams();
	params.set('state', opts.state ?? 'open');
	if (opts.labels && opts.labels.length > 0) {
		params.set('labels', opts.labels.join(','));
	}
	params.set('per_page', String(opts.limit ?? DEFAULT_LIST_PAGE_SIZE));
	const raw = (await restGet(
		fetchFn,
		`repos/${repo}/issues?${params.toString()}`,
		token,
	)) as IRawIssue[];
	if (!Array.isArray(raw)) return [];
	return raw.filter((i) => !('pull_request' in i)).map(toSummary);
};

// ---------------------------------------------------------------------------
// Public API: deterministic precedence gh -> rest-authed -> rest-anon
// ---------------------------------------------------------------------------

/**
 * Fetches one issue (detail + comments) for `repo` (`'owner/name'`),
 * trying `gh` CLI, then authenticated REST (if `GITHUB_TOKEN` is set),
 * then anonymous REST, in that deterministic order. Resolves with the
 * tier that actually served the data so callers can surface it.
 */
export const fetchIssue = async (
	repo: string,
	number: number,
	deps: IGithubClientDeps = {},
): Promise<IFetchIssueResult> => {
	const spawnFn = resolveSpawn(deps);
	const fetchFn = deps.fetchFn ?? (fetch as unknown as IFetchFn);
	const env = deps.env ?? process.env;

	const viaGh = await tryGhFetchIssue(spawnFn, repo, number);
	if (viaGh !== null) return { ...viaGh, tier: 'gh' };

	const token = env.GITHUB_TOKEN;
	if (token) {
		const viaAuthed = await restFetchIssue(fetchFn, repo, number, token);
		return { ...viaAuthed, tier: 'rest-authed' };
	}

	const viaAnon = await restFetchIssue(fetchFn, repo, number);
	return { ...viaAnon, tier: 'rest-anon' };
};

/**
 * Lists issues for `repo` (`'owner/name'`), trying `gh` CLI, then
 * authenticated REST, then anonymous REST, in that order.
 */
export const listIssues = async (
	repo: string,
	opts: IListIssuesOptions = {},
	deps: IGithubClientDeps = {},
): Promise<IListIssuesResult> => {
	const spawnFn = resolveSpawn(deps);
	const fetchFn = deps.fetchFn ?? (fetch as unknown as IFetchFn);
	const env = deps.env ?? process.env;

	const viaGh = await tryGhListIssues(spawnFn, repo, opts);
	if (viaGh !== null) return { issues: viaGh, tier: 'gh' };

	const token = env.GITHUB_TOKEN;
	if (token) {
		const viaAuthed = await restListIssues(fetchFn, repo, opts, token);
		return { issues: viaAuthed, tier: 'rest-authed' };
	}

	const viaAnon = await restListIssues(fetchFn, repo, opts);
	return { issues: viaAnon, tier: 'rest-anon' };
};

// ---------------------------------------------------------------------------
// Issue creation via gh CLI (f00251 S4)
// ---------------------------------------------------------------------------

/**
 * Creates a GitHub issue via `gh issue create` (argv-first, no shell).
 * Throws when the `gh` binary fails — callers are responsible for catching.
 */
export const createIssueViaGh = async (
	repo: string,
	input: IIssueCreateInput,
	spawnFn: ISpawn = defaultSpawn,
): Promise<IIssueCreateResult> => {
	const argv: readonly string[] = [
		'gh',
		'issue',
		'create',
		'--repo',
		repo,
		'--title',
		input.title,
		'--body',
		input.body,
		'--json',
		'number,url',
		...(input.labels !== undefined && input.labels.length > 0
			? input.labels.flatMap((l) => ['--label', l])
			: []),
	];
	const result = await spawnFn(argv);
	if (result.exitCode !== 0) {
		throw new Error(
			`gh issue create failed: ${decode(result.stderr).trim() || `exit ${result.exitCode}`}`,
		);
	}
	const parsed = JSON.parse(decode(result.stdout)) as {
		number: number;
		url: string;
	};
	return { issueNumber: parsed.number, issueUrl: parsed.url };
};

interface IRawDependabotPackage {
	readonly ecosystem?: string | null;
	readonly name?: string | null;
}

interface IRawDependabotDependency {
	readonly package?: IRawDependabotPackage | null;
}

interface IRawDependabotAdvisory {
	readonly ghsa_id?: string | null;
	readonly summary?: string | null;
	readonly severity?: string | null;
}

interface IRawDependabotSecurityVulnerability {
	readonly severity?: string | null;
	readonly advisory?: IRawDependabotAdvisory | null;
}

interface IRawDependabotAlert {
	readonly number: number;
	readonly state?: 'open' | 'dismissed' | 'fixed' | null;
	readonly dependency?: IRawDependabotDependency | null;
	readonly security_vulnerability?: IRawDependabotSecurityVulnerability | null;
	readonly html_url?: string | null;
	readonly created_at?: string | null;
	readonly updated_at?: string | null;
}

interface IRawCodeScanningRule {
	readonly id?: string | null;
	readonly severity?: string | null;
	readonly description?: string | null;
	readonly name?: string | null;
}

interface IRawCodeScanningTool {
	readonly name?: string | null;
	readonly version?: string | null;
}

interface IRawCodeScanningLocation {
	readonly path?: string | null;
	readonly start_line?: number | null;
}

interface IRawCodeScanningMostRecentInstance {
	readonly location?: IRawCodeScanningLocation | null;
}

interface IRawCodeScanningAlert {
	readonly number: number;
	readonly state?: 'open' | 'fixed' | 'dismissed' | null;
	readonly rule?: IRawCodeScanningRule | null;
	readonly tool?: IRawCodeScanningTool | null;
	readonly most_recent_instance?: IRawCodeScanningMostRecentInstance | null;
	readonly html_url?: string | null;
	readonly created_at?: string | null;
	readonly updated_at?: string | null;
}

interface IRawSecretScanningAlert {
	readonly number: number;
	readonly state?: 'open' | 'resolved' | null;
	readonly resolution?: string | null;
	readonly secret_type?: string | null;
	readonly push_protection_bypassed?: boolean | null;
	readonly validity?: string | null;
	readonly locations_count?: number | null;
	readonly html_url?: string | null;
	readonly created_at?: string | null;
	readonly updated_at?: string | null;
}

interface IRawSecurityAdvisory {
	readonly ghsa_id?: string | null;
	readonly cve_id?: string | null;
	readonly summary?: string | null;
	readonly severity?: string | null;
	readonly state?: string | null;
	readonly html_url?: string | null;
	readonly published_at?: string | null;
	readonly updated_at?: string | null;
}

const toDependabotAlert = (
	raw: IRawDependabotAlert,
): IDependabotAlertSummary => ({
	number: raw.number,
	state: raw.state ?? 'open',
	severity: (raw.security_vulnerability?.severity ??
		'low') as IDependabotAlertSummary['severity'],
	package: {
		ecosystem: raw.dependency?.package?.ecosystem ?? 'unknown',
		name: raw.dependency?.package?.name ?? 'unknown',
	},
	vuln: {
		id: raw.security_vulnerability?.advisory?.ghsa_id ?? 'unknown',
		severity:
			raw.security_vulnerability?.severity ??
			raw.security_vulnerability?.advisory?.severity ??
			'unknown',
		summary: raw.security_vulnerability?.advisory?.summary ?? null,
	},
	htmlUrl: raw.html_url ?? '',
	createdAt: raw.created_at ?? '',
	updatedAt: raw.updated_at ?? '',
});

const toCodeScanningAlert = (
	raw: IRawCodeScanningAlert,
): ICodeScanningAlertSummary => ({
	number: raw.number,
	state: raw.state ?? 'open',
	severity: (raw.rule?.severity ??
		'none') as ICodeScanningAlertSummary['severity'],
	rule: {
		id: raw.rule?.id ?? 'unknown',
		severity: raw.rule?.severity ?? 'unknown',
		description: raw.rule?.description ?? '',
		name: raw.rule?.name ?? 'unknown',
	},
	tool: {
		name: raw.tool?.name ?? 'unknown',
		version: raw.tool?.version ?? null,
	},
	mostRecentInstance:
		raw.most_recent_instance?.location?.path !== undefined &&
		raw.most_recent_instance.location.path !== null
			? {
					path: raw.most_recent_instance.location.path,
					startLine:
						raw.most_recent_instance.location.start_line ?? 0,
				}
			: null,
	htmlUrl: raw.html_url ?? '',
	createdAt: raw.created_at ?? '',
	updatedAt: raw.updated_at ?? '',
});

const toSecretScanningAlert = (
	raw: IRawSecretScanningAlert,
): ISecretScanningAlertSummary => ({
	number: raw.number,
	state: raw.state ?? (raw.resolution === null ? 'unknown' : 'unknown'),
	secretType: raw.secret_type ?? 'unknown',
	pushProtection: raw.push_protection_bypassed ?? false,
	validity: raw.validity ?? null,
	locationsCount: raw.locations_count ?? 0,
	htmlUrl: raw.html_url ?? '',
	createdAt: raw.created_at ?? '',
	updatedAt: raw.updated_at ?? '',
});

const toSecurityAdvisory = (
	raw: IRawSecurityAdvisory,
): ISecurityAdvisorySummary => ({
	ghsaId: raw.ghsa_id ?? 'unknown',
	cveId: raw.cve_id ?? null,
	summary: raw.summary ?? '',
	severity: raw.severity ?? 'unknown',
	state: raw.state ?? 'unknown',
	htmlUrl: raw.html_url ?? '',
	publishedAt: raw.published_at ?? null,
	updatedAt: raw.updated_at ?? null,
});

const tryGhListDependabotAlerts = async (
	spawnFn: ISpawn,
	repo: string,
	opts: IListDependabotAlertsOptions,
): Promise<readonly IDependabotAlertSummary[] | null> => {
	const params = new URLSearchParams();
	params.set('state', opts.state ?? 'open');
	if (opts.severity !== undefined) {
		params.set('severity', opts.severity);
	}
	params.set('per_page', String(opts.limit ?? DEFAULT_LIST_PAGE_SIZE));
	const raw = await tryGhApi(
		spawnFn,
		`repos/${repo}/dependabot/alerts?${params.toString()}`,
	);
	if (raw === null) return null;
	if (!Array.isArray(raw)) return [];
	return (raw as IRawDependabotAlert[]).map(toDependabotAlert);
};

const restListDependabotAlerts = async (
	fetchFn: IFetchFn,
	repo: string,
	opts: IListDependabotAlertsOptions,
	token?: string,
): Promise<readonly IDependabotAlertSummary[]> => {
	const params = new URLSearchParams();
	params.set('state', opts.state ?? 'open');
	if (opts.severity !== undefined) {
		params.set('severity', opts.severity);
	}
	params.set('per_page', String(opts.limit ?? DEFAULT_LIST_PAGE_SIZE));
	const raw = (await restGet(
		fetchFn,
		`repos/${repo}/dependabot/alerts?${params.toString()}`,
		token,
	)) as IRawDependabotAlert[];
	if (!Array.isArray(raw)) return [];
	return raw.map(toDependabotAlert);
};

const tryGhListCodeScanningAlerts = async (
	spawnFn: ISpawn,
	repo: string,
	opts: IListCodeScanningAlertsOptions,
): Promise<readonly ICodeScanningAlertSummary[] | null> => {
	const params = new URLSearchParams();
	params.set('state', opts.state ?? 'open');
	if (opts.severity !== undefined) {
		params.set('severity', opts.severity);
	}
	params.set('per_page', String(opts.limit ?? DEFAULT_LIST_PAGE_SIZE));
	const raw = await tryGhApi(
		spawnFn,
		`repos/${repo}/code-scanning/alerts?${params.toString()}`,
	);
	if (raw === null) return null;
	if (!Array.isArray(raw)) return [];
	return (raw as IRawCodeScanningAlert[]).map(toCodeScanningAlert);
};

const restListCodeScanningAlerts = async (
	fetchFn: IFetchFn,
	repo: string,
	opts: IListCodeScanningAlertsOptions,
	token?: string,
): Promise<readonly ICodeScanningAlertSummary[]> => {
	const params = new URLSearchParams();
	params.set('state', opts.state ?? 'open');
	if (opts.severity !== undefined) {
		params.set('severity', opts.severity);
	}
	params.set('per_page', String(opts.limit ?? DEFAULT_LIST_PAGE_SIZE));
	const raw = (await restGet(
		fetchFn,
		`repos/${repo}/code-scanning/alerts?${params.toString()}`,
		token,
	)) as IRawCodeScanningAlert[];
	if (!Array.isArray(raw)) return [];
	return raw.map(toCodeScanningAlert);
};

const tryGhListSecretScanningAlerts = async (
	spawnFn: ISpawn,
	repo: string,
	opts: IListSecretScanningAlertsOptions,
): Promise<readonly ISecretScanningAlertSummary[] | null> => {
	const params = new URLSearchParams();
	params.set('state', opts.state ?? 'open');
	params.set('per_page', String(opts.limit ?? DEFAULT_LIST_PAGE_SIZE));
	const raw = await tryGhApi(
		spawnFn,
		`repos/${repo}/secret-scanning/alerts?${params.toString()}`,
	);
	if (raw === null) return null;
	if (!Array.isArray(raw)) return [];
	return (raw as IRawSecretScanningAlert[]).map(toSecretScanningAlert);
};

const restListSecretScanningAlerts = async (
	fetchFn: IFetchFn,
	repo: string,
	opts: IListSecretScanningAlertsOptions,
	token?: string,
): Promise<readonly ISecretScanningAlertSummary[]> => {
	const params = new URLSearchParams();
	params.set('state', opts.state ?? 'open');
	params.set('per_page', String(opts.limit ?? DEFAULT_LIST_PAGE_SIZE));
	const raw = (await restGet(
		fetchFn,
		`repos/${repo}/secret-scanning/alerts?${params.toString()}`,
		token,
	)) as IRawSecretScanningAlert[];
	if (!Array.isArray(raw)) return [];
	return raw.map(toSecretScanningAlert);
};

const tryGhListSecurityAdvisories = async (
	spawnFn: ISpawn,
	repo: string,
	opts: IListSecurityAdvisoriesOptions,
): Promise<readonly ISecurityAdvisorySummary[] | null> => {
	const params = new URLSearchParams();
	params.set('state', opts.state ?? 'published');
	params.set('per_page', String(opts.limit ?? DEFAULT_LIST_PAGE_SIZE));
	const raw = await tryGhApi(
		spawnFn,
		`repos/${repo}/security-advisories?${params.toString()}`,
	);
	if (raw === null) return null;
	if (!Array.isArray(raw)) return [];
	return (raw as IRawSecurityAdvisory[]).map(toSecurityAdvisory);
};

const restListSecurityAdvisories = async (
	fetchFn: IFetchFn,
	repo: string,
	opts: IListSecurityAdvisoriesOptions,
	token?: string,
): Promise<readonly ISecurityAdvisorySummary[]> => {
	const params = new URLSearchParams();
	params.set('state', opts.state ?? 'published');
	params.set('per_page', String(opts.limit ?? DEFAULT_LIST_PAGE_SIZE));
	const raw = (await restGet(
		fetchFn,
		`repos/${repo}/security-advisories?${params.toString()}`,
		token,
	)) as IRawSecurityAdvisory[];
	if (!Array.isArray(raw)) return [];
	return raw.map(toSecurityAdvisory);
};

export const listDependabotAlerts = async (
	repo: string,
	opts: IListDependabotAlertsOptions = {},
	deps: IGithubClientDeps = {},
): Promise<IListDependabotAlertsResult> => {
	const spawnFn = resolveSpawn(deps);
	const fetchFn = deps.fetchFn ?? (fetch as unknown as IFetchFn);
	const env = deps.env ?? process.env;

	const viaGh = await tryGhListDependabotAlerts(spawnFn, repo, opts);
	if (viaGh !== null) return { alerts: viaGh, tier: 'gh' };

	const token = env.GITHUB_TOKEN;
	if (token) {
		const viaAuthed = await restListDependabotAlerts(
			fetchFn,
			repo,
			opts,
			token,
		);
		return { alerts: viaAuthed, tier: 'rest-authed' };
	}

	const viaAnon = await restListDependabotAlerts(fetchFn, repo, opts);
	return { alerts: viaAnon, tier: 'rest-anon' };
};

export const listCodeScanningAlerts = async (
	repo: string,
	opts: IListCodeScanningAlertsOptions = {},
	deps: IGithubClientDeps = {},
): Promise<IListCodeScanningAlertsResult> => {
	const spawnFn = resolveSpawn(deps);
	const fetchFn = deps.fetchFn ?? (fetch as unknown as IFetchFn);
	const env = deps.env ?? process.env;

	const viaGh = await tryGhListCodeScanningAlerts(spawnFn, repo, opts);
	if (viaGh !== null) return { alerts: viaGh, tier: 'gh' };

	const token = env.GITHUB_TOKEN;
	if (token) {
		const viaAuthed = await restListCodeScanningAlerts(
			fetchFn,
			repo,
			opts,
			token,
		);
		return { alerts: viaAuthed, tier: 'rest-authed' };
	}

	const viaAnon = await restListCodeScanningAlerts(fetchFn, repo, opts);
	return { alerts: viaAnon, tier: 'rest-anon' };
};

export const listSecretScanningAlerts = async (
	repo: string,
	opts: IListSecretScanningAlertsOptions = {},
	deps: IGithubClientDeps = {},
): Promise<IListSecretScanningAlertsResult> => {
	const spawnFn = resolveSpawn(deps);
	const fetchFn = deps.fetchFn ?? (fetch as unknown as IFetchFn);
	const env = deps.env ?? process.env;

	const viaGh = await tryGhListSecretScanningAlerts(spawnFn, repo, opts);
	if (viaGh !== null) return { alerts: viaGh, tier: 'gh' };

	const token = env.GITHUB_TOKEN;
	if (token) {
		const viaAuthed = await restListSecretScanningAlerts(
			fetchFn,
			repo,
			opts,
			token,
		);
		return { alerts: viaAuthed, tier: 'rest-authed' };
	}

	const viaAnon = await restListSecretScanningAlerts(fetchFn, repo, opts);
	return { alerts: viaAnon, tier: 'rest-anon' };
};

export const listSecurityAdvisories = async (
	repo: string,
	opts: IListSecurityAdvisoriesOptions = {},
	deps: IGithubClientDeps = {},
): Promise<IListSecurityAdvisoriesResult> => {
	const spawnFn = resolveSpawn(deps);
	const fetchFn = deps.fetchFn ?? (fetch as unknown as IFetchFn);
	const env = deps.env ?? process.env;

	const viaGh = await tryGhListSecurityAdvisories(spawnFn, repo, opts);
	if (viaGh !== null) return { advisories: viaGh, tier: 'gh' };

	const token = env.GITHUB_TOKEN;
	if (token) {
		const viaAuthed = await restListSecurityAdvisories(
			fetchFn,
			repo,
			opts,
			token,
		);
		return { advisories: viaAuthed, tier: 'rest-authed' };
	}

	const viaAnon = await restListSecurityAdvisories(fetchFn, repo, opts);
	return { advisories: viaAnon, tier: 'rest-anon' };
};
