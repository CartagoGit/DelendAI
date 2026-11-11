/**
 * github-land-forge.service.ts — `ILandForge` on GitHub, through the `gh` CLI the
 * forge seam already runs. Each method is one REST call; a refusal that
 * the contract names (409 head moved, 405/422 not mergeable) is an answer,
 * any other failure throws so the pass ends and the next one reads again.
 *
 * GitLab maps the same calls: pipelines for checks, `PUT .../merge` with
 * `sha`, `PUT .../rebase`, labels, notes and merge requests.
 */
import type {
	ILandCheck,
	ILandCommandRunner,
	ILandForge,
	ILandMerge,
	ILandPullRequest,
} from './land.interface';
import { LAND_MAX_PAGES, LAND_PAGE_SIZE } from './land.constant';

interface IRawPull {
	number: number;
	state: string;
	draft?: boolean;
	merged?: boolean;
	body?: string | null;
	labels?: { name: string }[];
	head: { ref: string; sha: string };
}

export const createGithubLandForge = (input: {
	readonly slug: string;
	readonly integration: string;
	readonly run: ILandCommandRunner;
	readonly mergeMethod?: 'merge' | 'squash' | 'rebase';
}): ILandForge => {
	const { slug, integration, run } = input;
	const call = async (
		method: string,
		path: string,
		fields: Readonly<Record<string, string>> = {},
	): Promise<{ status: number; body: unknown }> => {
		const result = await run([
			'api',
			'--method',
			method,
			`repos/${slug}/${path}`,
			...Object.entries(fields).flatMap(([k, v]) => ['-f', `${k}=${v}`]),
		]);
		if (result.exitCode === 0) {
			return {
				status: 200,
				body:
					result.stdout.trim() === ''
						? {}
						: JSON.parse(result.stdout),
			};
		}
		const status = Number(
			/HTTP (\d{3})/u.exec(`${result.stderr}${result.stdout}`)?.[1],
		);
		if (Number.isInteger(status)) return { status, body: undefined };
		throw new Error(
			`forge call ${method} ${path} failed: ${result.stderr.trim() || result.spawnError || 'no answer'}`,
		);
	};
	const ok = async <T>(path: string): Promise<T> => {
		const { status, body } = await call('GET', path);
		if (status !== 200)
			throw new Error(`GET ${path} answered ${String(status)}`);
		return body as T;
	};
	/**
	 * Every item of a listing, page after page: a pass that read only the
	 * first hundred pull requests or check runs judged on part of the facts.
	 * Bounded, so a runaway listing ends the pass instead of looping.
	 */
	const all = async <T>(
		path: string,
		itemsOf: (page: unknown) => readonly T[] = (page) =>
			page as readonly T[],
	): Promise<readonly T[]> => {
		const items: T[] = [];
		for (let page = 1; page <= LAND_MAX_PAGES; page += 1) {
			const got = itemsOf(
				await ok<unknown>(
					`${path}${path.includes('?') ? '&' : '?'}per_page=${String(LAND_PAGE_SIZE)}&page=${String(page)}`,
				),
			);
			items.push(...got);
			if (got.length < LAND_PAGE_SIZE) return items;
		}
		throw new Error(
			`GET ${path} has more than ${String(LAND_MAX_PAGES * LAND_PAGE_SIZE)} items; the pass ends rather than judge on part of them.`,
		);
	};
	const baseOf = async (pr: IRawPull): Promise<string> =>
		(
			await ok<{ merge_base_commit: { sha: string } }>(
				`compare/${integration}...${pr.head.sha}`,
			)
		).merge_base_commit.sha;
	/** Who pushed a head: its commit's author login, absent when GitHub names none. */
	const headAuthorOf = async (
		sha: string,
	): Promise<{ readonly headAuthor?: string }> => {
		const login = (
			await ok<{ author?: { login?: string } | null }>(`commits/${sha}`)
		).author?.login;
		return login === undefined ? {} : { headAuthor: login };
	};
	const view = async (pr: IRawPull): Promise<ILandPullRequest> => ({
		number: pr.number,
		headRef: pr.head.ref,
		headSha: pr.head.sha,
		draft: pr.draft === true,
		state: pr.state === 'open' ? 'open' : 'closed',
		merged: pr.merged === true,
		labels: (pr.labels ?? []).map((l) => l.name),
		body: pr.body ?? '',
		testedBase: await baseOf(pr),
		...(await headAuthorOf(pr.head.sha)),
	});
	const pulls = (query: string): Promise<readonly IRawPull[]> =>
		all<IRawPull>(`pulls?base=${integration}&${query}`);
	return {
		integrationTip: async () =>
			(await ok<{ commit: { sha: string } }>(`branches/${integration}`))
				.commit.sha,
		requiredChecks: async () =>
			(
				await ok<
					{
						type: string;
						parameters?: {
							required_status_checks?: { context: string }[];
						};
					}[]
				>(`rules/branches/${integration}`)
			).flatMap((rule) =>
				rule.type === 'required_status_checks'
					? (rule.parameters?.required_status_checks ?? []).map(
							(c) => c.context,
						)
					: [],
			),
		openPullRequests: async () =>
			Promise.all(
				(await pulls('state=open'))
					.filter((pr) => !pr.head.ref.includes('/queue/batch-'))
					.map(view),
			),
		// Every open batch, and the most recently closed ones: a red verdict
		// matters on the tip it was given on, which a closed batch older than
		// the last page of them no longer stands on.
		batchPullRequests: async (prefix) =>
			Promise.all(
				[
					...(await pulls('state=open')),
					...(await ok<IRawPull[]>(
						`pulls?base=${integration}&state=closed&sort=updated&direction=desc&per_page=${String(LAND_PAGE_SIZE)}`,
					)),
				]
					.filter(
						(pr, index, list) =>
							pr.head.ref.startsWith(`${prefix}batch-`) &&
							list.findIndex((o) => o.number === pr.number) ===
								index,
					)
					.map(view),
			),
		pullRequest: async (number) =>
			view(await ok<IRawPull>(`pulls/${String(number)}`)),
		checks: async (sha): Promise<readonly ILandCheck[]> =>
			(
				await all<{
					name: string;
					conclusion: string | null;
					html_url?: string;
				}>(
					`commits/${sha}/check-runs`,
					(page) =>
						(
							page as {
								check_runs: {
									name: string;
									conclusion: string | null;
									html_url?: string;
								}[];
							}
						).check_runs,
				)
			).map((c) => ({
				name: c.name,
				conclusion: c.conclusion,
				url: c.html_url,
			})),
		merge: async (number, sha): Promise<ILandMerge> => {
			const { status } = await call(
				'PUT',
				`pulls/${String(number)}/merge`,
				{
					sha,
					merge_method: input.mergeMethod ?? 'merge',
				},
			);
			return status === 200
				? 'merged'
				: status === 409
					? 'head-moved'
					: 'refused';
		},
		addLabel: async (number, label) => {
			await call('POST', `issues/${String(number)}/labels`, {
				'labels[]': label,
			});
		},
		removeLabel: async (number, label) => {
			await call(
				'DELETE',
				`issues/${String(number)}/labels/${encodeURIComponent(label)}`,
			);
		},
		comment: async (number, text) => {
			await call('POST', `issues/${String(number)}/comments`, {
				body: text,
			});
		},
		openPullRequest: async ({ head, title, body }) =>
			(
				(
					await call('POST', 'pulls', {
						head,
						base: integration,
						title,
						body,
					})
				).body as {
					number: number;
				}
			).number,
		updatePullRequest: async (number, body) => {
			await call('PATCH', `pulls/${String(number)}`, { body });
		},
		closePullRequest: async (number) => {
			await call('PATCH', `pulls/${String(number)}`, { state: 'closed' });
		},
		dispatchWorkflow: async (workflow, ref) =>
			(
				await call(
					'POST',
					`actions/workflows/${encodeURIComponent(workflow)}/dispatches`,
					{ ref },
				)
			).status === 200,
	};
};
