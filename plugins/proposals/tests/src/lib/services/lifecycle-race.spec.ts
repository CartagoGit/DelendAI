import { execFileSync } from 'node:child_process';
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
import { fileURLToPath } from 'node:url';

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

const writeProposal = async (proposalsDirAbs: string): Promise<void> => {
	await mkdir(join(proposalsDirAbs, 'review'), { recursive: true });
	await writeFile(
		join(proposalsDirAbs, 'review', 'r00047-lifecycle-fixture.md'),
		[
			'---',
			'id: r00047',
			'kind: refactor',
			'status: review',
			'shipped-in: [abcdef1]',
			'---',
			'',
			'# r00047',
			'',
		].join('\n'),
		'utf8',
	);
};

const recentValidate = () => ({
	timestamp: new Date().toISOString(),
	exitCode: 0 as const,
	logPath: '.cache/delendai/results/logs/validate.latest.log',
});

const REPO_ROOT = fileURLToPath(new URL('../../../../../../', import.meta.url));

const runBunJson = (script: string): Record<string, unknown> =>
	JSON.parse(
		execFileSync('bun', ['-e', script], {
			cwd: REPO_ROOT,
			encoding: 'utf8',
		}).trim(),
	);

describe('proposal lifecycle races (r00047 S3)', () => {
	let root = '';
	let options: IProposalTransitionToolOptions;

	beforeEach(async () => {
		root = await mkdtemp(join(tmpdir(), 'proposal-lifecycle-race-'));
		options = {
			namespacePrefix: 'proposals',
			proposalsDirAbs: root,
			workspaceRoot: root,
			indexPathAbs: join(root, '.cache/delendai/proposals/index.json'),
			gitRunner: FAKE_GIT_MV,
			requirePeerReview: false,
		};
	});

	afterEach(async () => rm(root, { recursive: true, force: true }));

	it('returns exactly one closed and the rest already_closed under concurrent closes', async () => {
		await writeProposal(root);

		const attempts = 24;
		const results = await Promise.all(
			Array.from({ length: attempts }, () =>
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

		const payloads = results.map(
			(result) => result.content[0]?.text ?? '{}',
		);
		const kinds = payloads.map((text) => {
			try {
				return (
					(JSON.parse(text) as { readonly kind?: string }).kind ??
					'no-kind'
				);
			} catch {
				return 'unparseable';
			}
		});

		// Report the WHOLE distribution, and one full payload for any
		// outcome that is neither expected. `toHaveLength(1)` on a
		// filtered array says "expected 1, received 0" and nothing about
		// which 24 answers actually came back — this failure was opaque
		// in CI for exactly that reason while passing locally every run.
		const distribution: Record<string, number> = {};
		for (const kind of kinds) {
			distribution[kind] = (distribution[kind] ?? 0) + 1;
		}
		const unexpected = payloads.find((_text, index) => {
			const kind = kinds[index];
			return kind !== 'closed' && kind !== 'already_closed';
		});
		const detail = `distribution=${JSON.stringify(distribution)}${
			unexpected === undefined
				? ''
				: ` firstUnexpectedPayload=${unexpected.slice(0, 600)}`
		}`;

		expect(
			kinds.filter((kind) => kind === 'closed'),
			`exactly one close must win — ${detail}`,
		).toHaveLength(1);
		expect(
			kinds.filter((kind) => kind === 'already_closed'),
			`every loser must report already_closed — ${detail}`,
		).toHaveLength(attempts - 1);
		await expect(
			readFile(
				join(root, 'done/refactors/r00047-lifecycle-fixture.md'),
				'utf8',
			),
		).resolves.toContain('status: done');
		await expect(
			readFile(join(root, 'review/r00047-lifecycle-fixture.md'), 'utf8'),
		).rejects.toMatchObject({ code: 'ENOENT' });
	});

	it('reports conflict with the current revision after a stale read loses to a newer write', () => {
		const result = runBunJson(`
import { ProposalRepo, ProposalsSqliteDriver } from './packages/proposals-sqlite/src/index.ts';

const driver = new ProposalsSqliteDriver({ path: ${JSON.stringify(join(root, 'proposals.sqlite'))} });
try {
	const repo = new ProposalRepo(driver.handle);
	repo.upsertProjection({
		uid: 'r00047',
		slug: 'r00047-lifecycle-fixture',
		path: 'ready/refactors/r00047-lifecycle-fixture.md',
		title: 'Lifecycle fixture',
		kind: 'refactor',
		status: 'ready',
		type: 'proposal',
		track: 'plugins/proposals+tests',
		bodyHash: 'hash-1',
	}, 100);
	const staleRead = repo.getByUid('r00047');
	const updated = repo.upsertProjection({
		uid: 'r00047',
		slug: 'r00047-lifecycle-fixture',
		path: 'ready/refactors/r00047-lifecycle-fixture.md',
		title: 'Lifecycle fixture v2',
		kind: 'refactor',
		status: 'ready',
		type: 'proposal',
		track: 'plugins/proposals+tests',
		bodyHash: 'hash-2',
	}, 101);
	const conflict = repo.closeProposal({
		uid: 'r00047',
		actor: 'github-copilot',
		source: 'unit-test',
		expectedRevision: staleRead?.revision,
		now: 102,
	});
	console.log(JSON.stringify({
		staleRevision: staleRead?.revision,
		updateKind: updated.kind,
		conflict,
	}));
} finally {
	driver.close();
}
`);

		expect(result.staleRevision).toBe(0);
		expect(result.updateKind).toBe('updated');
		expect(result.conflict).toMatchObject({
			kind: 'conflict',
			currentRevision: 1,
			proposal: {
				revision: 1,
				status: 'ready',
				title: 'Lifecycle fixture v2',
			},
		});
	});
});
