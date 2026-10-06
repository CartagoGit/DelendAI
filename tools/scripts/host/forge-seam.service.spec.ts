import { describe, expect, it } from 'vitest';

import { createForgeSeam } from './forge-seam.service';
import type {
	IForgeCommandResult,
	IForgeCommandRunner,
} from './forge-seam.interface';

const SLUG = 'acme/widgets';
const ETAG = 'W/"abc123"';

const answer = (
	status: number,
	headers: readonly string[],
	body: string,
	exitCode = 0,
): IForgeCommandResult => ({
	exitCode,
	stdout: `HTTP/2.0 ${String(status)} X\r\n${headers.join('\r\n')}\r\n\r\n${body}`,
	stderr: '',
});

/** A fake forge CLI that records every argument list it was given. */
const fakeCli = (
	reply: (args: readonly string[]) => IForgeCommandResult,
): { run: IForgeCommandRunner; calls: (readonly string[])[] } => {
	const calls: (readonly string[])[] = [];
	return {
		calls,
		run: async (args) => {
			calls.push(args);
			return reply(args);
		},
	};
};

const PULLS = JSON.stringify([
	{
		number: 7,
		state: 'open',
		draft: false,
		head: { ref: 'feature', sha: 'sha-7' },
		base: { ref: 'develop' },
	},
	{
		number: 8,
		state: 'open',
		draft: true,
		head: { ref: 'other', sha: 'sha-8' },
		base: { ref: 'develop' },
	},
	{ number: 9 },
]);

describe('createForgeSeam pull requests', () => {
	it('maps a 200 answer and keeps its ETag', async () => {
		const cli = fakeCli(() => answer(200, [`ETag: ${ETAG}`], PULLS));
		const seam = createForgeSeam({ repositorySlug: SLUG, run: cli.run });
		const read = await seam.listPullRequests({});
		expect(read).toEqual({
			kind: 'payload',
			etag: ETAG,
			payload: [
				{
					number: 7,
					headRef: 'feature',
					baseRef: 'develop',
					headSha: 'sha-7',
					state: 'open',
				},
				{
					number: 8,
					headRef: 'other',
					baseRef: 'develop',
					headSha: 'sha-8',
					state: 'draft',
				},
			],
		});
		expect(cli.calls[0]).toContain(
			`repos/${SLUG}/pulls?state=open&per_page=100`,
		);
		expect(cli.calls[0]).not.toContain('-H');
	});

	it('sends the previous ETag and reads a 304 as not-modified in one request', async () => {
		const cli = fakeCli(() => answer(304, [`Etag: ${ETAG}`], '', 1));
		const seam = createForgeSeam({ repositorySlug: SLUG, run: cli.run });
		const read = await seam.listPullRequests({ etag: ETAG });
		expect(read).toEqual({ kind: 'not-modified' });
		expect(cli.calls).toHaveLength(1);
		expect(cli.calls[0]).toContain(`If-None-Match: ${ETAG}`);
	});

	it('answers unavailable when the CLI is missing', async () => {
		const seam = createForgeSeam({
			repositorySlug: SLUG,
			run: async () => ({
				stdout: '',
				stderr: '',
				spawnError: 'spawn gh ENOENT',
			}),
		});
		const read = await seam.listPullRequests({});
		expect(read.kind).toBe('unavailable');
		if (read.kind === 'unavailable') {
			expect(read.reason).toContain('ENOENT');
		}
	});

	it('answers unavailable when the CLI is signed out', async () => {
		const seam = createForgeSeam({
			repositorySlug: SLUG,
			run: async () => ({
				exitCode: 4,
				stdout: '',
				stderr: 'To get started with GitHub CLI, please run: gh auth login\n',
			}),
		});
		const read = await seam.listPullRequests({});
		expect(read.kind).toBe('unavailable');
		if (read.kind === 'unavailable') {
			expect(read.reason).toContain('gh auth login');
		}
	});

	it('answers unavailable on a non-success status and on a malformed body', async () => {
		const forbidden = createForgeSeam({
			repositorySlug: SLUG,
			run: fakeCli(() => answer(403, [], '{}', 1)).run,
		});
		expect(await forbidden.listPullRequests({})).toEqual({
			kind: 'unavailable',
			reason: 'the forge answered HTTP 403',
		});
		const malformed = createForgeSeam({
			repositorySlug: SLUG,
			run: fakeCli(() => answer(200, [], 'not json')).run,
		});
		expect((await malformed.listPullRequests({})).kind).toBe('unavailable');
	});
});

describe('createForgeSeam check runs', () => {
	const CHECKS = JSON.stringify({
		check_runs: [
			{
				id: 11,
				name: 'validate',
				status: 'completed',
				conclusion: 'success',
				started_at: '2026-01-01T00:00:00Z',
				completed_at: '2026-01-01T00:01:00Z',
				app: { slug: 'github-actions' },
			},
			{ id: 12, name: 'lint', status: 'in_progress' },
			{ name: 'queued-one', status: 'queued' },
			{
				name: 'skipped-one',
				status: 'completed',
				conclusion: 'skipped',
			},
			{ status: 'completed' },
		],
	});

	it('asks once per sha and maps names, states and times', async () => {
		const cli = fakeCli(() => answer(200, [], CHECKS));
		const seam = createForgeSeam({ repositorySlug: SLUG, run: cli.run });
		const read = await seam.listCheckRuns({ shas: ['sha-7', 'sha-8'] });
		expect(cli.calls).toHaveLength(2);
		expect(cli.calls[1]).toContain(
			`repos/${SLUG}/commits/sha-8/check-runs?per_page=100`,
		);
		if (read.kind !== 'payload') throw new Error('expected a payload');
		expect(read.payload).toHaveLength(8);
		expect(read.payload[0]).toEqual({
			candidateSha: 'sha-7',
			workflow: 'github-actions',
			checkName: 'validate',
			externalId: '11',
			state: 'success',
			startedAt: Date.parse('2026-01-01T00:00:00Z'),
			completedAt: Date.parse('2026-01-01T00:01:00Z'),
		});
		expect(read.payload.slice(1, 4).map((run) => run.state)).toEqual([
			'in_progress',
			'queued',
			'neutral',
		]);
		expect(read.payload[1]?.workflow).toBe('unknown');
	});

	it('answers unavailable as a whole when one sha cannot be read', async () => {
		const seam = createForgeSeam({
			repositorySlug: SLUG,
			run: fakeCli((args) =>
				args.some((arg) => arg.includes('sha-bad'))
					? answer(404, [], '{}', 1)
					: answer(200, [], CHECKS),
			).run,
		});
		const read = await seam.listCheckRuns({ shas: ['sha-ok', 'sha-bad'] });
		expect(read.kind).toBe('unavailable');
	});
});
