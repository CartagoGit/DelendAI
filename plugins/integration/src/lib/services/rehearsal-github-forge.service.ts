/**
 * rehearsal-github-forge.service.ts — `IRehearsalForge` on GitHub, through
 * the `gh` CLI. Each method is one REST call (or one GraphQL mutation for a
 * pull request's draft state). The runner is injected, and `gh` acts as
 * whatever it is already signed in as: nothing here reads, prints or passes
 * a token.
 */
import {
	REHEARSAL_PAGE_LIMIT,
	REHEARSAL_PAGE_SIZE,
} from '../contracts/constants/rehearsal.constant';
import type {
	IRehearsalCommandRunner,
	IRehearsalFileChange,
	IRehearsalForge,
	IRehearsalPullEvent,
	IRehearsalPullState,
	IRehearsalRun,
} from '../contracts/interfaces/rehearsal.interface';

interface IRawPull {
	number: number;
	state: string;
	draft?: boolean;
	merged_at?: string | null;
	created_at: string;
	node_id: string;
	user?: { login?: string } | null;
	labels?: { name: string }[];
	head: { ref: string; sha: string };
	base: { ref: string };
}

interface IRawEvent {
	event: string;
	created_at: string;
	label?: { name?: string };
	actor?: { login?: string } | null;
}

interface IRawRun {
	id: number;
	name?: string | null;
	event: string;
	head_branch?: string | null;
	head_sha: string;
	status?: string | null;
	conclusion?: string | null;
	actor?: { login?: string } | null;
	created_at: string;
	updated_at: string;
}

const HTTP_OK = 200;
const HTTP_NOT_FOUND = 404;
const HTTP_UNPROCESSABLE = 422;
/** A regular, non-executable file in a git tree. */
const BLOB_FILE_MODE = 100644;

const DRAFT_MUTATIONS = {
	ready: 'markPullRequestReadyForReview',
	draft: 'convertPullRequestToDraft',
} as const;

const encodePath = (path: string): string =>
	path.split('/').map(encodeURIComponent).join('/');

export const createGithubRehearsalForge = (input: {
	/** `owner/name`. */
	readonly slug: string;
	readonly run: IRehearsalCommandRunner;
}): IRehearsalForge => {
	const { slug, run } = input;

	const request = async (
		method: string,
		path: string,
		options: {
			readonly fields?: Readonly<Record<string, string>>;
			readonly body?: unknown;
			readonly headers?: readonly string[];
		} = {},
	): Promise<{ readonly status: number; readonly text: string }> => {
		const result = await run(
			[
				'api',
				'--method',
				method,
				`repos/${slug}/${path}`,
				...(options.headers ?? []).flatMap((h) => ['-H', h]),
				...Object.entries(options.fields ?? {}).flatMap(([k, v]) => [
					'-f',
					`${k}=${v}`,
				]),
				...(options.body === undefined ? [] : ['--input', '-']),
			],
			options.body === undefined
				? undefined
				: JSON.stringify(options.body),
		);
		if (result.exitCode === 0)
			return { status: HTTP_OK, text: result.stdout };
		const status = Number(
			/HTTP (\d{3})/u.exec(`${result.stderr}${result.stdout}`)?.[1],
		);
		if (status === HTTP_NOT_FOUND || status === HTTP_UNPROCESSABLE)
			return { status, text: result.stdout };
		throw new Error(
			`forge call ${method} ${path} failed: ${result.stderr.trim() || result.spawnError || 'no answer'}`,
		);
	};
	const json = async <T>(
		method: string,
		path: string,
		options?: Parameters<typeof request>[2],
	): Promise<T> => {
		const { status, text } = await request(method, path, options);
		if (status !== HTTP_OK)
			throw new Error(`${method} ${path} answered ${String(status)}`);
		return (text.trim() === '' ? {} : JSON.parse(text)) as T;
	};
	const pages = async <T>(
		path: string,
		itemsOf: (page: unknown) => readonly T[] = (page) =>
			page as readonly T[],
	): Promise<readonly T[]> => {
		const items: T[] = [];
		for (let page = 1; page <= REHEARSAL_PAGE_LIMIT; page += 1) {
			const got = itemsOf(
				await json<unknown>(
					'GET',
					`${path}${path.includes('?') ? '&' : '?'}per_page=${String(REHEARSAL_PAGE_SIZE)}&page=${String(page)}`,
				),
			);
			items.push(...got);
			if (got.length < REHEARSAL_PAGE_SIZE) return items;
		}
		throw new Error(`GET ${path} has more pages than a rehearsal reads`);
	};
	const rawPull = (number: number): Promise<IRawPull> =>
		json<IRawPull>('GET', `pulls/${String(number)}`);
	const stateOf = (pull: IRawPull): IRehearsalPullState => ({
		number: pull.number,
		head: pull.head.ref,
		headSha: pull.head.sha,
		base: pull.base.ref,
		state: pull.state === 'open' ? 'open' : 'closed',
		draft: pull.draft === true,
		createdAt: pull.created_at,
		...(pull.merged_at ? { mergedAt: pull.merged_at } : {}),
		labels: (pull.labels ?? []).map((label) => label.name),
		author: pull.user?.login ?? '',
	});
	const treeOf = async (sha: string): Promise<string> =>
		(await json<{ tree: { sha: string } }>('GET', `git/commits/${sha}`))
			.tree.sha;
	const treeEntry = (change: IRehearsalFileChange) => ({
		path: change.path,
		mode: String(BLOB_FILE_MODE),
		type: 'blob',
		...(change.content === null
			? { sha: null }
			: { content: change.content }),
	});

	return {
		tipOf: async (branch) =>
			(
				await json<{ object: { sha: string } }>(
					'GET',
					`git/ref/heads/${encodePath(branch)}`,
				)
			).object.sha,
		createBranch: async (name, sha) => {
			await json('POST', 'git/refs', {
				fields: { ref: `refs/heads/${name}`, sha },
			});
		},
		deleteBranch: async (name) => {
			await request('DELETE', `git/refs/heads/${encodePath(name)}`);
		},
		listBranches: async (prefix) =>
			(
				await pages<{ ref: string }>(
					`git/matching-refs/heads/${encodePath(prefix)}`,
				)
			).map((entry) => entry.ref.slice('refs/heads/'.length)),
		commit: async (commit) => {
			const base = commit.treeFrom ?? commit.parents[0];
			if (base === undefined)
				throw new Error(
					'a commit needs a parent to take its tree from',
				);
			const tree = await json<{ sha: string }>('POST', 'git/trees', {
				body: {
					base_tree: await treeOf(base),
					tree: commit.changes.map(treeEntry),
				},
			});
			const made = await json<{ sha: string }>('POST', 'git/commits', {
				body: {
					message: commit.message,
					tree: tree.sha,
					parents: commit.parents,
				},
			});
			await json('PATCH', `git/refs/heads/${encodePath(commit.branch)}`, {
				body: { sha: made.sha, force: false },
			});
			return made.sha;
		},
		listFiles: async (sha, dir) => {
			const { status, text } = await request(
				'GET',
				`contents/${encodePath(dir)}?ref=${sha}`,
			);
			if (status !== HTTP_OK) return [];
			return (JSON.parse(text) as { name: string; type: string }[])
				.filter((entry) => entry.type === 'file')
				.map((entry) => entry.name);
		},
		readFile: async (sha, path) => {
			const { status, text } = await request(
				'GET',
				`contents/${encodePath(path)}?ref=${sha}`,
				{ headers: ['Accept: application/vnd.github.raw+json'] },
			);
			if (status !== HTTP_OK)
				throw new Error(`${path} is not at ${sha} (${String(status)})`);
			return text;
		},
		history: async (branch, until) => {
			// Newest first, and the walk ends at `until`: a branch cut from a long
			// history is never read past the commit the run made it from.
			const shas: string[] = [];
			for (let page = 1; page <= REHEARSAL_PAGE_LIMIT; page += 1) {
				const got = await json<{ sha: string }[]>(
					'GET',
					`commits?sha=${encodeURIComponent(branch)}&per_page=${String(REHEARSAL_PAGE_SIZE)}&page=${String(page)}`,
				);
				for (const entry of got) {
					shas.push(entry.sha);
					if (entry.sha === until) return shas;
				}
				if (got.length < REHEARSAL_PAGE_SIZE) return shas;
			}
			throw new Error(
				`${until} is not in the last ${String(REHEARSAL_PAGE_LIMIT * REHEARSAL_PAGE_SIZE)} commits of ${branch}`,
			);
		},
		openPull: async (pull) =>
			(
				await json<{ number: number }>('POST', 'pulls', {
					fields: {
						title: pull.title,
						body: pull.body,
						head: pull.head,
						base: pull.base,
						draft: String(pull.draft),
					},
				})
			).number,
		setDraft: async (number, draft) => {
			const { node_id: id } = await rawPull(number);
			const mutation = DRAFT_MUTATIONS[draft ? 'draft' : 'ready'];
			const result = await run([
				'api',
				'graphql',
				'-f',
				`query=mutation($id: ID!) { ${mutation}(input: {pullRequestId: $id}) { clientMutationId } }`,
				'-f',
				`id=${id}`,
			]);
			if (result.exitCode !== 0)
				throw new Error(
					`${mutation} failed: ${result.stderr.trim() || result.spawnError || 'no answer'}`,
				);
		},
		mergePull: async (number, sha) => {
			await json('PUT', `pulls/${String(number)}/merge`, {
				fields: { sha, merge_method: 'merge' },
			});
		},
		closePull: async (number) => {
			await json('PATCH', `pulls/${String(number)}`, {
				fields: { state: 'closed' },
			});
		},
		addLabel: async (number, label) => {
			await json('POST', `issues/${String(number)}/labels`, {
				body: { labels: [label] },
			});
		},
		pulls: async (base) =>
			(
				await pages<IRawPull>(
					`pulls?state=all&base=${encodeURIComponent(base)}`,
				)
			).map(stateOf),
		pullEvents: async (number): Promise<readonly IRehearsalPullEvent[]> =>
			(await pages<IRawEvent>(`issues/${String(number)}/events`)).map(
				(event) => ({
					event: event.event,
					...(event.label?.name === undefined
						? {}
						: { label: event.label.name }),
					createdAt: event.created_at,
					actor: event.actor?.login ?? '',
				}),
			),
		runs: async (branch): Promise<readonly IRehearsalRun[]> =>
			(
				await pages<IRawRun>(
					`actions/runs?branch=${encodeURIComponent(branch)}`,
					(page) =>
						(page as { workflow_runs: IRawRun[] }).workflow_runs,
				)
			).map((entry) => ({
				id: entry.id,
				workflow: entry.name ?? '',
				event: entry.event,
				headBranch: entry.head_branch ?? '',
				headSha: entry.head_sha,
				status: entry.status ?? '',
				...(entry.conclusion ? { conclusion: entry.conclusion } : {}),
				actor: entry.actor?.login ?? '',
				createdAt: entry.created_at,
				updatedAt: entry.updated_at,
			})),
		runLog: async (id) => {
			const result = await run([
				'run',
				'view',
				String(id),
				'--log',
				'--repo',
				slug,
			]);
			// A run that never started a job (held for approval, skipped) has no log: nothing to scan.
			if (/log not found/u.test(result.stderr)) return '';
			if (result.exitCode !== 0)
				throw new Error(
					`the log of run ${String(id)} could not be read: ${result.stderr.trim() || result.spawnError || 'no answer'}`,
				);
			return result.stdout;
		},
		labels: async (prefix) =>
			(await pages<{ name: string }>('labels'))
				.map((label) => label.name)
				.filter((name) => name.startsWith(prefix)),
		deleteLabel: async (name) => {
			await request('DELETE', `labels/${encodeURIComponent(name)}`);
		},
		hooks: async () =>
			(
				await pages<{ id: number; config?: { url?: string } }>('hooks')
			).map((hook) => ({ id: hook.id, url: hook.config?.url ?? '' })),
		deleteHook: async (id) => {
			await request('DELETE', `hooks/${String(id)}`);
		},
	};
};
