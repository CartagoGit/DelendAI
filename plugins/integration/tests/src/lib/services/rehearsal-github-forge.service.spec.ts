import { describe, expect, it } from 'vitest';

import type { IRehearsalCommandRunner } from '../../../../src/lib/contracts/interfaces/rehearsal.interface';
import { createGithubRehearsalForge } from '../../../../src/lib/services/rehearsal-github-forge.service';

interface ICall {
	readonly args: readonly string[];
	readonly input?: string | undefined;
}

const fake = (answers: Record<string, string>) => {
	const calls: ICall[] = [];
	const run: IRehearsalCommandRunner = async (args, input) => {
		calls.push({ args, input });
		const key = Object.keys(answers).find((k) =>
			args.join(' ').includes(k),
		);
		return key === undefined
			? { exitCode: 1, stdout: '', stderr: 'HTTP 404' }
			: { exitCode: 0, stdout: answers[key] ?? '', stderr: '' };
	};
	return { calls, forge: createGithubRehearsalForge({ slug: 'o/r', run }) };
};

describe('the GitHub rehearsal forge', () => {
	it('[<50ms] reads a branch tip', async () => {
		const { forge, calls } = fake({
			'git/ref/heads/a/b': '{"object":{"sha":"s1"}}',
		});
		expect(await forge.tipOf('a/b')).toBe('s1');
		expect(calls[0]?.args).toContain('repos/o/r/git/ref/heads/a/b');
	});

	it('[<50ms] makes one commit with the given parents through trees and commits, never by force', async () => {
		const { forge, calls } = fake({
			'git/commits/p1': '{"tree":{"sha":"t0"}}',
			'git/trees': '{"sha":"t1"}',
			'--method POST repos/o/r/git/commits': '{"sha":"c1"}',
			'git/refs/heads/b': '{}',
		});
		const sha = await forge.commit({
			branch: 'b',
			parents: ['p1', 'p2'],
			message: 'm',
			changes: [
				{ path: 'rehearsal/x', content: 'hi' },
				{ path: 'rehearsal/y', content: null },
			],
		});
		expect(sha).toBe('c1');
		const tree = JSON.parse(
			calls.find((c) => c.args.includes('repos/o/r/git/trees'))?.input ??
				'{}',
		);
		expect(tree.base_tree).toBe('t0');
		expect(tree.tree[1]).toMatchObject({ path: 'rehearsal/y', sha: null });
		const commit = JSON.parse(
			calls.find(
				(c) =>
					c.args.includes('repos/o/r/git/commits') &&
					c.input !== undefined,
			)?.input ?? '{}',
		);
		expect(commit.parents).toEqual(['p1', 'p2']);
		const move = JSON.parse(calls.at(-1)?.input ?? '{}');
		expect(move).toEqual({ sha: 'c1', force: false });
	});

	it('[<50ms] maps a pull request and its merge fields', async () => {
		const { forge } = fake({
			'pulls?state=all': JSON.stringify([
				{
					number: 3,
					state: 'closed',
					draft: false,
					merged_at: '2026-11-12T10:00:00Z',
					created_at: '2026-11-12T09:00:00Z',
					node_id: 'N',
					user: { login: 'bot' },
					labels: [{ name: 'l' }],
					head: { ref: 'h', sha: 's' },
					base: { ref: 'b' },
				},
			]),
		});
		expect(await forge.pulls('b')).toEqual([
			{
				number: 3,
				head: 'h',
				headSha: 's',
				base: 'b',
				state: 'closed',
				draft: false,
				createdAt: '2026-11-12T09:00:00Z',
				mergedAt: '2026-11-12T10:00:00Z',
				labels: ['l'],
				author: 'bot',
			},
		]);
	});

	it('[<50ms] marks a pull request ready with the GraphQL mutation', async () => {
		const { forge, calls } = fake({
			'pulls/5': '{"node_id":"NODE"}',
			graphql: '{}',
		});
		await forge.setDraft(5, false);
		const gql = calls.at(-1)?.args.join(' ') ?? '';
		expect(gql).toContain('markPullRequestReadyForReview');
		expect(gql).toContain('id=NODE');
	});

	it('[<50ms] treats a missing directory as no files', async () => {
		const { forge } = fake({});
		expect(await forge.listFiles('s', 'rehearsal/x')).toEqual([]);
	});

	it('[<50ms] throws on a refusal other than not-found', async () => {
		const run: IRehearsalCommandRunner = async () => ({
			exitCode: 1,
			stdout: '',
			stderr: 'HTTP 500',
		});
		const forge = createGithubRehearsalForge({ slug: 'o/r', run });
		await expect(forge.tipOf('b')).rejects.toThrow('failed');
	});

	it('[<50ms] never passes a token on a command line', async () => {
		const { forge, calls } = fake({
			'git/ref/heads/b': '{"object":{"sha":"s"}}',
		});
		await forge.tipOf('b');
		expect(calls.flatMap((c) => c.args).join(' ')).not.toMatch(
			/token|--hostname|Authorization/iu,
		);
	});

	it('[<100ms] makes, lists and deletes branches, labels and hooks through the matching calls', async () => {
		const { forge, calls } = fake({
			'git/matching-refs/heads/ns/rehearsal/':
				'[{"ref":"refs/heads/ns/rehearsal/r1/a"}]',
			'--method GET repos/o/r/labels':
				'[{"name":"rehearsal-r1:x"},{"name":"bug"}]',
			'--method GET repos/o/r/hooks':
				'[{"id":9,"config":{"url":"https://h"}}]',
			'--method POST repos/o/r/git/refs': '{}',
			'--method DELETE': '{}',
		});
		expect(await forge.listBranches('ns/rehearsal/')).toEqual([
			'ns/rehearsal/r1/a',
		]);
		await forge.createBranch('ns/rehearsal/r1/b', 'sha');
		await forge.deleteBranch('ns/rehearsal/r1/b');
		expect(await forge.labels('rehearsal-r1:')).toEqual(['rehearsal-r1:x']);
		await forge.deleteLabel('rehearsal-r1:x');
		expect(await forge.hooks()).toEqual([{ id: 9, url: 'https://h' }]);
		await forge.deleteHook(9);
		const joined = calls.map((c) => c.args.join(' ')).join('\n');
		expect(joined).toContain('git/refs/heads/ns/rehearsal/r1/b');
		expect(joined).toContain('labels/rehearsal-r1%3Ax');
		expect(joined).toContain('hooks/9');
	});

	it('[<100ms] opens, merges, closes and labels a pull request and reads its timeline and runs', async () => {
		const { forge, calls } = fake({
			'--method POST repos/o/r/pulls': '{"number":11}',
			'pulls/11/merge': '{}',
			'--method PATCH repos/o/r/pulls/11': '{}',
			'issues/11/labels': '[]',
			'issues/11/events':
				'[{"event":"labeled","created_at":"t","label":{"name":"l"},"actor":{"login":"a"}},{"event":"merged","created_at":"u"}]',
			'actions/runs': JSON.stringify({
				workflow_runs: [
					{
						id: 1,
						name: 'ci',
						event: 'push',
						head_branch: 'b',
						head_sha: 's',
						status: 'completed',
						conclusion: 'success',
						actor: { login: 'x' },
						created_at: 'c',
						updated_at: 'd',
					},
					{
						id: 2,
						event: 'push',
						head_sha: 's2',
						created_at: 'c',
						updated_at: 'd',
					},
				],
			}),
			'commits?sha=': '[{"sha":"n"},{"sha":"u"},{"sha":"older"}]',
		});
		expect(
			await forge.openPull({
				head: 'h',
				base: 'b',
				title: 't',
				body: 'x',
				draft: true,
			}),
		).toBe(11);
		await forge.mergePull(11, 'sha');
		await forge.closePull(11);
		await forge.addLabel(11, 'l');
		expect(await forge.pullEvents(11)).toEqual([
			{ event: 'labeled', label: 'l', createdAt: 't', actor: 'a' },
			{ event: 'merged', createdAt: 'u', actor: '' },
		]);
		const runs = await forge.runs('b');
		expect(runs[0]).toMatchObject({
			id: 1,
			workflow: 'ci',
			conclusion: 'success',
		});
		expect(runs[1]).toMatchObject({
			workflow: '',
			headBranch: '',
			actor: '',
		});
		expect(await forge.history('main', 'u')).toEqual(['n', 'u']);
		const merge = calls.find((c) =>
			c.args.join(' ').includes('pulls/11/merge'),
		);
		expect(merge?.args.join(' ')).toContain('merge_method=merge');
	});

	it('[<100ms] reads a file and the files of a directory at a commit', async () => {
		const { forge } = fake({
			'contents/rehearsal?ref=s':
				'[{"name":"a.json","type":"file"},{"name":"d","type":"dir"}]',
			'contents/rehearsal/a.json': 'body',
		});
		expect(await forge.listFiles('s', 'rehearsal')).toEqual(['a.json']);
		expect(await forge.readFile('s', 'rehearsal/a.json')).toBe('body');
		await expect(forge.readFile('s', 'missing')).rejects.toThrow(
			'is not at',
		);
	});

	it('[<100ms] reads a run log through gh and says so when it cannot', async () => {
		const ok = createGithubRehearsalForge({
			slug: 'o/r',
			run: async () => ({ exitCode: 0, stdout: 'log text', stderr: '' }),
		});
		expect(await ok.runLog(5)).toBe('log text');
		const bad = createGithubRehearsalForge({
			slug: 'o/r',
			run: async () => ({ exitCode: 1, stdout: '', stderr: 'gone' }),
		});
		await expect(bad.runLog(5)).rejects.toThrow('gone');
		await expect(bad.setDraft(1, true)).rejects.toThrow();
	});

	it('[<100ms] converts a pull request to draft with the matching mutation', async () => {
		const { forge, calls } = fake({
			'pulls/6': '{"node_id":"N6"}',
			graphql: '{}',
		});
		await forge.setDraft(6, true);
		expect(calls.at(-1)?.args.join(' ')).toContain(
			'convertPullRequestToDraft',
		);
	});

	it('[<100ms] stops reading history at the commit it was asked down to, however long the rest is', async () => {
		const calls: string[] = [];
		const page = JSON.stringify(
			Array.from({ length: 100 }, (_, i) => ({
				sha: i === 3 ? 'stop' : `c${String(i)}`,
			})),
		);
		const forge = createGithubRehearsalForge({
			slug: 'o/r',
			run: async (args) => {
				calls.push(args.join(' '));
				return { exitCode: 0, stdout: page, stderr: '' };
			},
		});
		expect(await forge.history('b', 'stop')).toEqual([
			'c0',
			'c1',
			'c2',
			'stop',
		]);
		expect(calls).toHaveLength(1);
	});

	it('[<100ms] refuses a history that never reaches the commit', async () => {
		const full = JSON.stringify(
			Array.from({ length: 100 }, (_, i) => ({ sha: `c${String(i)}` })),
		);
		const forge = createGithubRehearsalForge({
			slug: 'o/r',
			run: async () => ({ exitCode: 0, stdout: full, stderr: '' }),
		});
		await expect(forge.history('b', 'gone')).rejects.toThrow(
			'is not in the last',
		);
	});

	it('[<100ms] reads a run that has no log as an empty log', async () => {
		const forge = createGithubRehearsalForge({
			slug: 'o/r',
			run: async () => ({
				exitCode: 1,
				stdout: '',
				stderr: 'failed to get run log: log not found',
			}),
		});
		expect(await forge.runLog(7)).toBe('');
	});
});
