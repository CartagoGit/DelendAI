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
});
