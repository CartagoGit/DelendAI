/**
 * catalog-sweep.spec.ts — every read tool of the GitHub catalog maps
 * both a fully populated and a bare payload, with and without paging,
 * and turns a failing client into an error envelope.
 */
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { createFakeToolServer } from '@delendai/test-kit';

import type { IGitHubProviderContext } from '../../../src/lib/config';
import { GitHubRequestError } from '../../../src/lib/client';
import { buildGitHubToolRegistrations } from '../../../src/lib/tools';

type Handler = (args: unknown) => Promise<unknown>;
type Respond = (request: {
	readonly path: string;
	readonly parseAs?: string;
	readonly responseSchema?: {
		safeParse: (value: unknown) => { success: boolean };
	};
}) => unknown;

const context = (
	repository: IGitHubProviderContext['repository'],
): IGitHubProviderContext => ({
	provider: 'github',
	token: 'secret-token',
	apiBaseUrl: 'https://api.github.com',
	webBaseUrl: 'https://github.com',
	host: 'github.com',
	repository,
	timeoutMs: 1000,
	maxRetries: 0,
	retryBaseDelayMs: 1,
	sources: {
		token: 'env:GITHUB_TOKEN',
		apiBaseUrl: 'default',
		webBaseUrl: 'default',
		repository: ['plugin'],
	},
});

const REPOSITORY = {
	provider: 'github' as const,
	host: 'github.com',
	owner: 'CartagoGit',
	repository: 'delendai',
	webUrl: 'https://github.com/CartagoGit/delendai',
	apiUrl: 'https://api.github.com/repos/CartagoGit/delendai',
};

const URL_ = 'https://github.com/x';
const BASE = {
	id: 5,
	number: 7,
	title: 'title',
	name: 'name',
	full_name: 'o/name',
	path: '.github/ci.yml',
	state: 'open',
	body: 'body',
	html_url: URL_,
	url: URL_,
	user: { login: 'ada' },
	owner: { login: 'ada' },
	creator: { login: 'ada' },
	author: { login: 'ada' },
	committer: { login: 'bob' },
	labels: [{ name: 'bug' }, { name: '' }],
	comments: 2,
	draft: true,
	head: { ref: 'feat' },
	base: { ref: 'main' },
	reviewDecision: 'APPROVED',
	mergeable_state: 'clean',
	sha: 'abc',
	commit: { message: 'subject\nmore', author: { date: 'd' }, sha: 'abc' },
	files: [{ filename: 'a.ts', status: 'modified', additions: 1 }],
	stats: { additions: 1, deletions: 2, total: 3 },
	status: 'completed',
	conclusion: 'success',
	workflow_id: 9,
	head_branch: 'feat',
	created_at: 'c',
	updated_at: 'u',
	started_at: 's',
	completed_at: 'e',
	details_url: URL_,
	context: 'ci',
	target_url: URL_,
	description: 'desc',
	environment: 'prod',
	size_in_bytes: 10,
	expired: false,
	archive_download_url: URL_,
	tag_name: 'v1',
	prerelease: false,
	published_at: 'p',
	visibility: 'all',
	total_count: 1,
};
const RICH = {
	...BASE,
	items: [BASE],
	variables: [BASE],
	workflows: [BASE],
	workflow_runs: [BASE],
	jobs: [BASE],
	artifacts: [BASE],
	check_runs: [BASE],
	statuses: [BASE],
};

const PAGED = {
	status: 200,
	requestId: 'r',
	durationMs: 1,
	attempts: 1,
	pagination: {
		page: 2,
		perPage: 5,
		nextPage: '3',
		previousPage: '1',
		total: 9,
		totalPages: 2,
		hasMore: true,
	},
	rateLimit: null,
	truncated: null,
};
const UNPAGED = { ...PAGED, pagination: null };

const ARGS = {
	issue: 7,
	pr: 7,
	sha: 'abc',
	ref: 'main',
	runId: 3,
	jobId: 4,
	workflowId: 'ci.yml',
	releaseId: 8,
	deploymentId: 6,
	query: 'delendai',
	owner: 'CartagoGit',
	state: 'closed',
	labels: ['bug'],
	branch: 'main',
	status: 'completed',
	page: 2,
	perPage: 5,
	limit: 3,
	persist: false,
};
const TOOLS = [
	'context',
	'repositories_get',
	'repositories_search',
	'repositories_variables',
	'issues_list',
	'issues_show',
	'pull_requests_list',
	'pull_requests_show',
	'commits_list',
	'commits_show',
	'commit_statuses',
	'checks_runs',
	'workflows_list',
	'workflows_runs',
	'workflow_run',
	'jobs_list',
	'jobs_logs',
	'artifacts_list',
	'releases_list',
	'releases_show',
	'tags_list',
	'deployments_list',
	'deployment_statuses',
];

const roots: string[] = [];
afterEach(async () => {
	for (const root of roots.splice(0))
		await rm(root, { recursive: true, force: true });
});

const suite = async (options: {
	readonly respond: Respond;
	readonly meta?: typeof PAGED | typeof UNPAGED;
	readonly repository?: IGitHubProviderContext['repository'];
	readonly fail?: Error;
	readonly workspaceRootAbs?: string;
}) => {
	const found = new Map<string, Handler>();
	const server = createFakeToolServer({
		onRegisterTool: (tool) => {
			found.set(tool.name, async (args) => tool.handler(args));
		},
	});
	for (const reg of buildGitHubToolRegistrations({
		namespacePrefix: 'github',
		workspaceRootAbs: options.workspaceRootAbs ?? '/',
		pluginCacheDir: 'cache',
		context: context(
			options.repository === undefined ? REPOSITORY : options.repository,
		),
		client: {
			request: async (request: Parameters<Respond>[0]) => {
				if (options.fail !== undefined) throw options.fail;
				return {
					data: options.respond(request),
					meta: options.meta ?? UNPAGED,
				};
			},
		},
	}))
		await reg.register(server);
	return found;
};

/** Array when the tool expects a list, the populated object otherwise. */
const shaped =
	(object: unknown, array: unknown): Respond =>
	(request) => {
		if (request.parseAs === 'text') return 'line one\nline two\nline three';
		return request.responseSchema?.safeParse([]).success === true
			? array
			: object;
	};

const run = async (
	all: ReadonlyMap<string, Handler>,
	name: string,
	args: unknown,
): Promise<{ ok?: boolean; error?: { code: string } }> => {
	const result = (await all.get(`github_${name}`)?.(args)) as {
		content: { text: string }[];
	};
	return JSON.parse(result.content[0]?.text ?? '{}');
};

describe('github catalog sweep', () => {
	it('registers every read tool', async () => {
		const all = await suite({ respond: () => ({}) });
		expect([...all.keys()].sort()).toEqual(
			TOOLS.map((name) => `github_${name}`).sort(),
		);
	});

	it.each([
		['populated and paged', shaped(RICH, [BASE, RICH]), PAGED],
		['populated and unpaged', shaped(RICH, [BASE]), UNPAGED],
		['bare and unpaged', shaped({}, [{}]), UNPAGED],
		['empty', shaped(null, []), UNPAGED],
	])('maps a %s payload', async (_label, respond, meta) => {
		const all = await suite({ respond, meta });
		for (const name of TOOLS) {
			const out = await run(all, name, ARGS);
			expect(out.ok, name).toBe(true);
			expect(await run(all, name, {})).toBeDefined();
		}
	});

	it('truncates and persists job logs', async () => {
		const dir = await mkdtemp(join(tmpdir(), 'gh-logs-'));
		roots.push(dir);
		const all = await suite({
			respond: shaped({}, []),
			workspaceRootAbs: dir,
		});
		for (const limits of [
			{ maxLines: 1 },
			{ maxBytes: 5 },
			{ maxMs: 1 },
			{ maxBytes: 1_000_000, persist: true },
		]) {
			const out = await run(all, 'jobs_logs', { jobId: 4, ...limits });
			expect(out.ok).toBe(true);
		}
		expect(await readdir(join(dir, 'cache', 'jobs'))).toEqual(['4.json']);
	});

	it('turns failures into error envelopes', async () => {
		const noRepository = await suite({
			respond: () => ({}),
			repository: null,
		});
		expect(await run(noRepository, 'issues_list', {})).toMatchObject({
			ok: false,
			error: { code: 'invalid-config' },
		});
		const broken = await suite({
			respond: () => ({}),
			fail: new Error('boom secret-token'),
		});
		const out = await run(broken, 'issues_list', {});
		expect(out).toMatchObject({
			ok: false,
			error: { code: 'invalid-response' },
		});
		expect(JSON.stringify(out)).not.toContain('secret-token');
		const remote = await suite({
			respond: () => ({}),
			fail: new GitHubRequestError({
				code: 'rate-limited',
				provider: 'github',
				message: 'slow down secret-token',
				status: 429,
				requestId: 'r',
				retryAfterSeconds: 3,
				temporary: true,
				retryable: true,
				details: { token: 'secret-token', n: 1 },
			}),
		});
		expect(await run(remote, 'issues_list', {})).toMatchObject({
			ok: false,
			error: { code: 'rate-limited', status: 429 },
		});
	});
});
