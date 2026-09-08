import {
	mkdir,
	mkdtemp,
	readFile,
	rename,
	rm,
	writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
	runProposalTransition,
	type IProposalTransitionToolOptions,
} from '@delendai/proposals/lib/tools/proposal-transition.tool';
import type { IGitRunner } from '@delendai/proposals/lib/shared/git-runner';

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

const writeProposal = async (
	proposalsDirAbs: string,
	status: 'review' | 'done'
): Promise<void> => {
	const folder = status === 'done' ? 'done/refactors' : status;
	await mkdir(join(proposalsDirAbs, folder), { recursive: true });
	await writeFile(
		join(proposalsDirAbs, folder, 'r00047-lifecycle-fixture.md'),
		[
			'---',
			'id: r00047',
			'kind: refactor',
			`status: ${status}`,
			'shipped-in: [abcdef1]',
			'---',
			'',
			'# r00047',
			'',
		].join('\n'),
		'utf8'
	);
};

const recentValidate = () => ({
	timestamp: new Date().toISOString(),
	exitCode: 0 as const,
	logPath: '.cache/delendai/results/logs/validate.latest.log',
});

const parseKind = async (
	options: IProposalTransitionToolOptions
): Promise<readonly string[]> => {
	const outcomes: string[] = [];
	for (let index = 0; index < 100; index += 1) {
		const result = await runProposalTransition(
			{
				id: 'r00047',
				to: 'done',
				reason: `close attempt ${String(index + 1)}`,
				validateEvidence: recentValidate(),
			},
			options
		);
		const payload = JSON.parse(result.content[0]?.text ?? '{}') as {
			readonly kind?: string;
		};
		outcomes.push(payload.kind ?? 'unknown');
	}
	return outcomes;
};

describe('proposal lifecycle idempotency (r00047 S3)', () => {
	let root = '';
	let options: IProposalTransitionToolOptions;

	beforeEach(async () => {
		root = await mkdtemp(join(tmpdir(), 'proposal-lifecycle-idempotency-'));
		options = {
			namespacePrefix: 'proposals',
			proposalsDirAbs: root,
			workspaceRoot: root,
			indexPathAbs: join(root, '.cache/delendai/proposals/index.json'),
			gitRunner: FAKE_GIT_MV,
			requirePeerReview: false,
		};
		await writeProposal(root, 'review');
	});

	afterEach(async () => rm(root, { recursive: true, force: true }));

	it('returns one closed result followed by 99 already_closed replays', async () => {
		const kinds = await parseKind(options);

		expect(kinds[0]).toBe('closed');
		expect(kinds.filter((kind) => kind === 'closed')).toHaveLength(1);
		expect(kinds.filter((kind) => kind === 'already_closed')).toHaveLength(
			99
		);
		await expect(
			readFile(
				join(root, 'done/refactors/r00047-lifecycle-fixture.md'),
				'utf8'
			)
		).resolves.toContain('status: done');
		await expect(
			readFile(join(root, 'review/r00047-lifecycle-fixture.md'), 'utf8')
		).rejects.toMatchObject({ code: 'ENOENT' });
	});
});
