/**
 * triage-tools.spec.ts — the three issue-bot tools against a stand-in for
 * the `gh` CLI: what each asks the forge, what it writes locally, how it
 * reports a forge failure, and where it declares its writes land.
 */
import {
	mkdirSync,
	mkdtempSync,
	readdirSync,
	readFileSync,
	rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import type { IToolRegistration } from '@delendai/core/public';
import { createFakeToolServer } from '@delendai/test-kit/public';

import type { IGhExec } from '../src/lib/contracts/interfaces/github.interface';
import { buildTriageToolRegistrations } from '../src/lib/tools/triage.tools';

const roots: string[] = [];
afterEach(() => {
	for (const root of roots.splice(0))
		rmSync(root, { recursive: true, force: true });
});

const ok = (stdout: string) => ({ ok: true, code: 0, stdout, stderr: '' });
const fail = (stderr: string) => ({ ok: false, code: 1, stdout: '', stderr });

/** A `gh` that answers each subcommand, and records what it was asked. */
const fakeGh = (
	answers: Partial<Record<string, ReturnType<typeof ok>>> = {},
) => {
	const asked: string[][] = [];
	const exec: IGhExec = async (argv) => {
		asked.push([...argv]);
		const key = `${argv[0]} ${argv[1]}`;
		const answer = answers[key];
		if (answer !== undefined) return answer;
		if (key === 'issue list') {
			return ok(
				JSON.stringify([
					{
						number: 7,
						title: 'Crash',
						labels: [{ name: 'bug' }],
						updatedAt: '2026-09-24',
					},
				]),
			);
		}
		if (key === 'issue view') {
			return ok(
				JSON.stringify({
					number: 7,
					title: 'TypeError: cannot read properties of undefined',
					body: 'Stack trace:\n  at x (packages/core/src/a.ts:1)',
					labels: [],
					comments: [],
				}),
			);
		}
		if (key === 'issue comment')
			return ok('https://github.com/o/r/issues/7#c1\n');
		return ok('');
	};
	return { exec, asked };
};

const handlers = async (
	exec: IGhExec,
	proposals?: { proposalsDirAbs: string; counterPathAbs: string },
) => {
	const found = new Map<string, (args: unknown) => Promise<unknown>>();
	const registrations = buildTriageToolRegistrations({
		namespacePrefix: 'issues-triage',
		repo: 'o/r',
		exec,
		...(proposals !== undefined ? { proposals } : {}),
	});
	for (const registration of registrations) {
		await registration.register(
			createFakeToolServer({
				onRegisterTool: (tool) => {
					found.set(registration.id, async (args) =>
						tool.handler(args),
					);
				},
			}),
		);
	}
	return { found, registrations };
};

const payload = (result: unknown): Record<string, unknown> => {
	const typed = result as {
		structuredContent?: Record<string, unknown>;
		content?: { text?: string }[];
	};
	return (
		typed.structuredContent ??
		(JSON.parse(typed.content?.[0]?.text ?? '{}') as Record<
			string,
			unknown
		>)
	);
};

describe('triage_list', () => {
	it('lists the open issues with their label names', async () => {
		const { found } = await handlers(fakeGh().exec);
		expect(payload(await found.get('triage_list')?.({}))).toMatchObject({
			repo: 'o/r',
			open: [{ number: 7, labels: ['bug'] }],
		});
	});

	it('reports the forge failure instead of an empty list', async () => {
		const { found } = await handlers(
			fakeGh({ 'issue list': fail('HTTP 401') }).exec,
		);
		expect(JSON.stringify(await found.get('triage_list')?.({}))).toContain(
			'HTTP 401',
		);
	});
});

describe('triage_run', () => {
	it('analyses, comments as the bot and labels, writing nothing when not asked', async () => {
		const gh = fakeGh();
		const { found } = await handlers(gh.exec);
		const result = payload(
			await found.get('triage_run')?.({ number: 7, addLabel: true }),
		);
		expect(result).toMatchObject({
			ok: true,
			issueNumber: 7,
			proposalWritten: false,
			commentPosted: true,
			commentUrl: 'https://github.com/o/r/issues/7#c1',
			labelsApplied: ['triaged'],
		});
		expect(gh.asked.map((argv) => `${argv[0]} ${argv[1]}`)).toEqual([
			'issue view',
			'issue comment',
			'issue edit',
		]);
	});

	it('writes the drafted proposal under ready/ with an allocated id', async () => {
		const root = mkdtempSync(join(tmpdir(), 'triage-'));
		roots.push(root);
		const proposalsDirAbs = join(root, 'proposals');
		mkdirSync(join(proposalsDirAbs, 'ready'), { recursive: true });
		const { found } = await handlers(fakeGh().exec, {
			proposalsDirAbs,
			counterPathAbs: join(root, 'counter.json'),
		});
		const result = payload(
			await found.get('triage_run')?.({
				number: 7,
				writeProposal: true,
				comment: false,
			}),
		);
		expect(result).toMatchObject({
			proposalWritten: true,
			commentPosted: false,
		});
		const written = readdirSync(join(proposalsDirAbs, 'ready'));
		expect(written).toHaveLength(1);
		expect(written[0]).toMatch(/^x\d+-/u);
		expect(
			readFileSync(
				join(proposalsDirAbs, 'ready', written[0] ?? ''),
				'utf8',
			),
		).toContain('issues/7');
	});

	it('reports an issue it could not fetch', async () => {
		const { found } = await handlers(
			fakeGh({ 'issue view': fail('not found') }).exec,
		);
		expect(
			JSON.stringify(await found.get('triage_run')?.({ number: 7 })),
		).toContain('not found');
	});

	it('still reports the analysis when the comment and label fail', async () => {
		const { found } = await handlers(
			fakeGh({
				'issue comment': fail('rate limited'),
				'issue edit': fail('no permission'),
			}).exec,
		);
		expect(
			payload(
				await found.get('triage_run')?.({ number: 7, addLabel: true }),
			),
		).toMatchObject({ ok: true, commentPosted: false, labelsApplied: [] });
	});
});

describe('triage_comment', () => {
	it('posts the comment with the bot notice and returns its url', async () => {
		const gh = fakeGh();
		const { found } = await handlers(gh.exec);
		expect(
			payload(
				await found.get('triage_comment')?.({
					number: 7,
					body: 'Progress.',
				}),
			),
		).toMatchObject({
			ok: true,
			url: 'https://github.com/o/r/issues/7#c1',
		});
		expect(gh.asked[0]?.join(' ')).toContain('Progress.');
	});

	it('reports a comment the forge refused', async () => {
		const { found } = await handlers(
			fakeGh({ 'issue comment': fail('locked') }).exec,
		);
		expect(
			payload(
				await found.get('triage_comment')?.({ number: 7, body: 'x' }),
			),
		).toMatchObject({ ok: false, reason: 'locked' });
	});
});

describe('where the triage tools write', () => {
	it('declares the caller checkout for the run, which writes a proposal, and the remote for the comment', async () => {
		const { registrations } = await handlers(fakeGh().exec);
		const byId = new Map(
			registrations.map((r: IToolRegistration) => [r.id, r.writeRoot]),
		);
		expect(byId.get('triage_run')).toBe('caller-checkout');
		expect(byId.get('triage_comment')).toBe('remote');
		expect(byId.get('triage_list')).toBeUndefined();
	});
});
