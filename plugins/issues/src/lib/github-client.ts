/**
 * Talks to GitHub for one repo (`owner/name`, injected by the caller —
 * this module never reads `mcp-vertex.config.json` itself; that's the
 * plugin's `register()`, wired in a later slice).
 *
 * Single Responsibility: this module only knows how to fetch issue data
 * from GitHub, through three tiers of deterministic precedence (see the
 * proposal's "### 3.4 GitHub client strategy" section):
 *
 *   1. `gh` CLI (`Bun.spawnSync(['gh', 'api', ...])`) — honours the
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
 * area to `Bun.spawnSync` + native `fetch`).
 */

import type {
	IGithubComment,
	IGithubIssueDetail,
	IGithubIssueSummary,
} from './contracts/issue.types';

export type IGithubClientTier = 'gh' | 'rest-authed' | 'rest-anon';

export interface IFetchIssueResult {
	readonly data: IGithubIssueDetail;
	readonly comments: readonly IGithubComment[];
	readonly tier: IGithubClientTier;
}

export interface IListIssuesOptions {
	readonly state?: 'open' | 'closed' | 'all';
	readonly labels?: readonly string[];
	readonly limit?: number;
}

export interface IListIssuesResult {
	readonly issues: readonly IGithubIssueSummary[];
	readonly tier: IGithubClientTier;
}

/** Injectable subset of `Bun.spawnSync` this module needs (testability). */
export type ISpawnSync = (cmd: readonly string[]) => {
	readonly exitCode: number;
	readonly stdout: Uint8Array;
	readonly stderr: Uint8Array;
};

/** Injectable subset of the global `fetch` this module needs (testability). */
export type IFetchFn = (
	url: string,
	init?: { readonly headers?: Record<string, string> },
) => Promise<{
	readonly ok: boolean;
	readonly status: number;
	json: () => Promise<unknown>;
}>;

export interface IGithubClientDeps {
	readonly spawnSync?: ISpawnSync;
	readonly fetchFn?: IFetchFn;
	readonly env?: Readonly<Record<string, string | undefined>>;
}

const defaultSpawnSync: ISpawnSync = (cmd) => {
	const result = Bun.spawnSync(cmd as string[]);
	return {
		exitCode: result.exitCode,
		stdout: result.stdout,
		stderr: result.stderr,
	};
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
const tryGhApi = (spawnSync: ISpawnSync, path: string): unknown | null => {
	const result = spawnSync(['gh', 'api', path]);
	if (result.exitCode === 127) return null; // command not found
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

const tryGhFetchIssue = (
	spawnSync: ISpawnSync,
	repo: string,
	number: number,
): { data: IGithubIssueDetail; comments: readonly IGithubComment[] } | null => {
	const issueRaw = tryGhApi(spawnSync, `repos/${repo}/issues/${number}`);
	if (issueRaw === null) return null;
	const commentsRaw = tryGhApi(
		spawnSync,
		`repos/${repo}/issues/${number}/comments`,
	);
	const comments = Array.isArray(commentsRaw)
		? (commentsRaw as IRawComment[]).map(toComment)
		: [];
	return { data: toDetail(issueRaw as IRawIssue, comments), comments };
};

const tryGhListIssues = (
	spawnSync: ISpawnSync,
	repo: string,
	opts: IListIssuesOptions,
): readonly IGithubIssueSummary[] | null => {
	const params = new URLSearchParams();
	params.set('state', opts.state ?? 'open');
	if (opts.labels && opts.labels.length > 0) {
		params.set('labels', opts.labels.join(','));
	}
	params.set('per_page', String(opts.limit ?? 30));
	const path = `repos/${repo}/issues?${params.toString()}`;
	const raw = tryGhApi(spawnSync, path);
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
	params.set('per_page', String(opts.limit ?? 30));
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
	const spawnSync = deps.spawnSync ?? defaultSpawnSync;
	const fetchFn = deps.fetchFn ?? (fetch as unknown as IFetchFn);
	const env = deps.env ?? process.env;

	const viaGh = tryGhFetchIssue(spawnSync, repo, number);
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
	const spawnSync = deps.spawnSync ?? defaultSpawnSync;
	const fetchFn = deps.fetchFn ?? (fetch as unknown as IFetchFn);
	const env = deps.env ?? process.env;

	const viaGh = tryGhListIssues(spawnSync, repo, opts);
	if (viaGh !== null) return { issues: viaGh, tier: 'gh' };

	const token = env.GITHUB_TOKEN;
	if (token) {
		const viaAuthed = await restListIssues(fetchFn, repo, opts, token);
		return { issues: viaAuthed, tier: 'rest-authed' };
	}

	const viaAnon = await restListIssues(fetchFn, repo, opts);
	return { issues: viaAnon, tier: 'rest-anon' };
};
