import { mkdir, mkdtemp, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import * as locateModule from '@delendai/proposals/lib/proposals/locate';
import type { IGitRunner } from '@delendai/proposals/lib/shared/git-runner';
import {
	runProposalTransition,
	type IProposalTransitionToolOptions,
} from '@delendai/proposals/lib/tools/proposal-transition.tool';

const FAKE_GIT_MV: IGitRunner = async (args) => {
	if (args[0] === 'mv') {
		const [, from, to] = args;
		if (from && to) await rename(from, to);
	}
	if (args[0] === 'ls-files') {
		return { ok: true, output: '' };
	}
	return { ok: true, output: '' };
};

const writeIndex = async (
	indexPathAbs: string,
	file: string,
	status: string,
) => {
	await mkdir(join(indexPathAbs, '..'), { recursive: true });
	await writeFile(
		indexPathAbs,
		JSON.stringify({
			proposals: [
				{
					id: 'r00047',
					file,
					status,
					type: 'refactor',
				},
			],
		}),
		'utf8',
	);
};

const writeProposal = async (
	root: string,
	status: 'review' | 'done',
) => {
	const folder = status === 'done' ? 'done/refactors' : status;
	const file = `${folder}/r00047-idempotent-close.md`;
	await mkdir(join(root, folder), { recursive: true });
	await writeFile(
		join(root, file),
		[
			'---',
			'id: r00047',
			'kind: refactor',
			`status: ${status}`,
			...(status === 'done' ? ['shipped-in: [abcdef1]'] : ['shipped-in: [abcdef1]']),
			'---',
			'',
			'# r00047',
			'',
		].join('\n'),
		'utf8',
	);
	return file;
};

const recentValidate = () => ({
	timestamp: new Date().toISOString(),
	exitCode: 0 as const,
	logPath: '.cache/delendai/results/logs/validate.latest.log',
});

describe('close proposal lifecycle idempotency', () => {
	let root = '';
	let options: IProposalTransitionToolOptions;

	beforeEach(async () => {
		root = await mkdtemp(join(tmpdir(), 'close-proposal-'));
		options = {
			namespacePrefix: 'proposals',
			proposalsDirAbs: root,
			workspaceRoot: root,
			indexPathAbs: join(root, '.cache/delendai/proposals/index.json'),
			gitRunner: FAKE_GIT_MV,
			requirePeerReview: false,
		};
	});

	afterEach(async () => {
		vi.restoreAllMocks();
		await rm(root, { recursive: true, force: true });
	});

	it('returns already_closed on a repeated close attempt', async () => {
		const file = await writeProposal(root, 'review');
		await writeIndex(options.indexPathAbs!, file, 'review');

		const closed = await runProposalTransition(
			{
				id: 'r00047',
				to: 'done',
				reason: 'ship it',
				validateEvidence: recentValidate(),
			},
			options,
		);
		expect(JSON.parse(closed.content[0]?.text ?? '{}').kind).toBe('closed');

		const repeated = await runProposalTransition(
			{
				id: 'r00047',
				to: 'done',
				reason: 'ship it again',
				validateEvidence: recentValidate(),
			},
			options,
		);

		const payload = JSON.parse(repeated.content[0]?.text ?? '{}') as {
			ok: boolean;
			kind?: string;
			already_closed?: boolean;
		};
		expect(payload.ok).toBe(true);
		expect(payload.kind).toBe('already_closed');
		expect(payload.already_closed).toBe(true);
	});

	it('returns one closed and the rest already_closed under concurrent close race', async () => {
		const file = await writeProposal(root, 'review');
		await writeIndex(options.indexPathAbs!, file, 'review');

		const results = await Promise.all(
			Array.from({ length: 8 }, () =>
				runProposalTransition(
					{
						id: 'r00047',
						to: 'done',
						reason: 'concurrent close',
						validateEvidence: recentValidate(),
					},
					options,
				),
			),
		);

		const kinds = results.map(
			(result) => JSON.parse(result.content[0]?.text ?? '{}').kind,
		);
		expect(kinds.filter((kind) => kind === 'closed')).toHaveLength(1);
		expect(
			kinds.filter((kind) => kind === 'already_closed'),
		).toHaveLength(7);
		await expect(
			readFile(join(root, 'done/refactors/r00047-idempotent-close.md'), 'utf8'),
		).resolves.toContain('status: done');
	});

	it('returns already_closed when a stale locator read points at the pre-close path', async () => {
		const file = await writeProposal(root, 'review');
		await writeIndex(options.indexPathAbs!, file, 'review');

		await runProposalTransition(
			{
				id: 'r00047',
				to: 'done',
				reason: 'first close',
				validateEvidence: recentValidate(),
			},
			options,
		);

		const actualLocate = locateModule.locateProposal;
		vi.spyOn(locateModule, 'locateProposal')
			.mockImplementationOnce(async () => ({
				absPath: join(root, 'review/r00047-idempotent-close.md'),
				folder: 'review',
				id: 'r00047',
				type: 'refactor',
				status: 'review',
			}))
			.mockImplementation(actualLocate);

		const retried = await runProposalTransition(
			{
				id: 'r00047',
				to: 'done',
				reason: 'retry from stale read',
				validateEvidence: recentValidate(),
			},
			options,
		);

		const payload = JSON.parse(retried.content[0]?.text ?? '{}') as {
			kind?: string;
			already_closed?: boolean;
		};
		expect(payload.kind).toBe('already_closed');
		expect(payload.already_closed).toBe(true);
	});
});