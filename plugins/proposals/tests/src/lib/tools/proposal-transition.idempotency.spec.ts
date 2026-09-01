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
} from '@mcp-vertex/proposals/lib/tools/proposal-transition.tool';
import type { IGitRunner } from '@mcp-vertex/proposals/lib/shared/git-runner';

const FAKE_GIT_MV: IGitRunner = async (args) => {
	if (args[0] === 'mv') {
		const [, from, to] = args;
		if (from && to) await rename(from, to);
	}
	return { ok: true, output: '' };
};

const writeProposal = async (
	proposalsDirAbs: string,
	folder: string,
	filename: string,
	frontmatter: Record<string, string>,
): Promise<void> => {
	const dir = join(proposalsDirAbs, folder);
	await mkdir(dir, { recursive: true });
	const lines = Object.entries(frontmatter).map(([k, v]) => `${k}: ${v}`);
	const raw = `---\n${lines.join('\n')}\n---\n\n## Goal\n\nfixture\n`;
	await writeFile(join(dir, filename), raw, 'utf8');
};

describe('proposal_transition idempotency metadata (r00042 S2)', () => {
	let root = '';
	let options: IProposalTransitionToolOptions;

	beforeEach(async () => {
		root = await mkdtemp(join(tmpdir(), 'transition-idempotency-'));
		options = {
			namespacePrefix: 'proposals',
			proposalsDirAbs: root,
			workspaceRoot: root,
			gitRunner: FAKE_GIT_MV,
			requirePeerReview: false,
		};
	});

	afterEach(async () => rm(root, { recursive: true, force: true }));

	it('remains backward compatible when idempotencyKey is omitted', async () => {
		await writeProposal(root, 'ready', 'r00042-no-key.md', {
			id: 'r00042',
			status: 'ready',
			kind: 'refactor',
		});

		const result = await runProposalTransition(
			{
				id: 'r00042',
				to: 'in-progress',
				reason: 'claim slice',
				transitionId: 'transition-no-key',
				correlationId: 'correlation-no-key',
			},
			options,
		);

		const payload = JSON.parse(result.content[0]?.text ?? '{}') as {
			ok: boolean;
			transitionId?: string;
			correlationId?: string;
			idempotencyKey?: string;
		};
		expect(payload.ok).toBe(true);
		expect(payload.transitionId).toBe('transition-no-key');
		expect(payload.correlationId).toBe('correlation-no-key');
		expect(payload.idempotencyKey).toBeUndefined();

		const moved = await readFile(
			join(root, 'in-progress', 'r00042-no-key.md'),
			'utf8',
		);
		expect(moved).toContain('last-transition-id: transition-no-key');
		expect(moved).toContain('last-correlation-id: correlation-no-key');
	});

	it('replays the same transition without duplicating the effect when idempotencyKey matches', async () => {
		await writeProposal(root, 'ready', 'r00043-replay.md', {
			id: 'r00043',
			status: 'ready',
			kind: 'refactor',
		});

		await runProposalTransition(
			{
				id: 'r00043',
				to: 'in-progress',
				reason: 'claim slice',
				transitionId: 'transition-first',
				correlationId: 'correlation-first',
				idempotencyKey: 'idem-r00043',
			},
			options,
		);
		const replay = await runProposalTransition(
			{
				id: 'r00043',
				to: 'in-progress',
				reason: 'claim slice',
				transitionId: 'transition-second',
				correlationId: 'correlation-second',
				idempotencyKey: 'idem-r00043',
			},
			options,
		);

		const payload = JSON.parse(replay.content[0]?.text ?? '{}') as {
			ok: boolean;
			from?: string;
			to?: string;
			transitionId?: string;
			correlationId?: string;
			idempotencyKey?: string;
			idempotentReplay?: boolean;
			movedTo?: string;
		};
		expect(payload.ok).toBe(true);
		expect(payload.from).toBe('ready');
		expect(payload.to).toBe('in-progress');
		expect(payload.transitionId).toBe('transition-first');
		expect(payload.correlationId).toBe('correlation-first');
		expect(payload.idempotencyKey).toBe('idem-r00043');
		expect(payload.idempotentReplay).toBe(true);
		expect(payload.movedTo).toBe('in-progress/r00043-replay.md');

		const moved = await readFile(
			join(root, 'in-progress', 'r00043-replay.md'),
			'utf8',
		);
		expect(moved).toContain('last-transition-id: transition-first');
		expect(moved).toContain('last-correlation-id: correlation-first');
		expect(moved).toContain('last-idempotency-key: idem-r00043');
	});

	it('rejects reusing an idempotencyKey for a different target status', async () => {
		await writeProposal(root, 'ready', 'r00044-conflict.md', {
			id: 'r00044',
			status: 'ready',
			kind: 'refactor',
		});

		await runProposalTransition(
			{
				id: 'r00044',
				to: 'in-progress',
				reason: 'claim slice',
				idempotencyKey: 'idem-r00044',
			},
			options,
		);
		const conflict = await runProposalTransition(
			{
				id: 'r00044',
				to: 'review',
				reason: 'advance wrongly',
				idempotencyKey: 'idem-r00044',
			},
			options,
		);

		expect('isError' in conflict && conflict.isError).toBe(true);
		const payload = JSON.parse(conflict.content[0]?.text ?? '{}') as {
			ok: boolean;
			error?: { code?: string };
		};
		expect(payload.ok).toBe(false);
		expect(payload.error?.code).toBe('idempotency-key-conflict');
	});
});
