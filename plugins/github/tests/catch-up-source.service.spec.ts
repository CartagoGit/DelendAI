/**
 * catch-up-source.service.spec.ts — GitHub's answers about a pull request
 * become forge-neutral events, read with `gh` and never written.
 */

import { describe, expect, it } from 'vitest';

import { createGitHubCatchUpSource } from '../src/lib/catch-up-source.service';

const fakeGh = (
	answers: Readonly<Record<string, string>>,
	calls: (readonly string[])[] = [],
) => ({
	calls,
	run: (args: readonly string[]) => {
		calls.push(args);
		return Promise.resolve({
			stdout: answers[args.slice(0, 3).join(' ')] ?? '',
		});
	},
});

const target = { repository: 'o/r', number: 7 };

describe('createGitHubCatchUpSource', () => {
	it('[<10ms] reports a merged pull request as pr.merged on its head', async () => {
		const gh = fakeGh({
			'pr view 7': JSON.stringify({
				state: 'MERGED',
				headRefOid: 'abc',
				labels: [],
			}),
		});
		const source = createGitHubCatchUpSource({ run: gh.run, labels: [] });
		expect(await source.missed([target])).toEqual([
			{ repository: 'o/r', number: 7, kind: 'pr.merged', sha: 'abc' },
		]);
		expect(
			gh.calls.every(
				(args) =>
					args[0] === 'pr' &&
					['view', 'checks'].includes(args[1] ?? ''),
			),
		).toBe(true);
	});

	it('[<10ms] reports a closed pull request and asks nothing more of it', async () => {
		const gh = fakeGh({
			'pr view 7': JSON.stringify({
				state: 'CLOSED',
				headRefOid: 'abc',
				labels: [],
			}),
		});
		const events = await createGitHubCatchUpSource({
			run: gh.run,
			labels: [],
		}).missed([target]);
		expect(events.map((event) => event.kind)).toEqual(['pr.closed']);
		expect(gh.calls).toHaveLength(1);
	});

	it('[<10ms] reports watched labels and failed required checks of an open one', async () => {
		const gh = fakeGh({
			'pr view 7': JSON.stringify({
				state: 'OPEN',
				headRefOid: 'abc',
				labels: [{ name: 'needs-update' }, { name: 'bug' }],
			}),
			'pr checks 7': JSON.stringify([
				{ name: 'validate', bucket: 'fail' },
				{ name: 'codeql', bucket: 'pass' },
				{ name: 'scan', bucket: 'cancel' },
			]),
		});
		const events = await createGitHubCatchUpSource({
			run: gh.run,
			labels: ['needs-update', 'culprit'],
		}).missed([target]);
		expect(
			events.map(
				(event) =>
					`${event.kind}:${event.label ?? event.check ?? ''}:${event.conclusion ?? ''}`,
			),
		).toEqual([
			'pr.updated:needs-update:',
			'check.completed:validate:failure',
			'check.completed:scan:cancelled',
		]);
	});

	it('[<10ms] one unreadable pull request does not hide the others', async () => {
		const run = (args: readonly string[]) =>
			args[2] === '1'
				? Promise.reject(new Error('gh missing'))
				: Promise.resolve({
						stdout: JSON.stringify({
							state: 'MERGED',
							headRefOid: 'x',
							labels: [],
						}),
					});
		const events = await createGitHubCatchUpSource({
			run,
			labels: [],
		}).missed([
			{ repository: 'o/r', number: 1 },
			{ repository: 'o/r', number: 2 },
		]);
		expect(events).toHaveLength(1);
		expect(events[0]?.number).toBe(2);
	});

	it('[<10ms] an answer that is not JSON yields nothing', async () => {
		const gh = fakeGh({ 'pr view 7': 'oops' });
		expect(
			await createGitHubCatchUpSource({ run: gh.run, labels: [] }).missed(
				[target],
			),
		).toEqual([]);
	});
});
