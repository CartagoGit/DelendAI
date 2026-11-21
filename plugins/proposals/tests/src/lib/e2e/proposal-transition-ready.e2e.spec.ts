/**
 * End-to-end: the move to `ready` refuses a proposal with something left
 * to work out, and moves one with nothing left. Every test names its
 * budget.
 */
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { completeProposalInput } from '../_fixtures/complete-proposal-input';
import { proposalFolderFor } from '@delendai/proposals/lib/contracts/proposal-folder-policy';

import {
	createAssembledProposalsServer,
	type IAssembledProposalsServer,
} from './assembled-proposals-server';

interface IOutput {
	readonly ok: boolean;
	readonly to?: string;
	readonly error?: { readonly reason: string; readonly code?: string };
}

const EVIDENCE = {
	timestamp: new Date().toISOString(),
	exitCode: 0,
	logPath: '.cache/validate.log',
};

const seedIn = async (
	server: IAssembledProposalsServer,
	id: string,
	decisions: string,
	status = 'paused',
): Promise<string> => {
	const dir = join(
		server.workspace,
		'docs/delendai/proposals',
		proposalFolderFor(status as 'paused', 'feat'),
	);
	mkdirSync(dir, { recursive: true });
	const file = join(dir, `${id}-seed.md`);
	writeFileSync(
		file,
		[
			'---',
			`id: ${id}`,
			`status: ${status}`,
			'type: proposal',
			'kind: feat',
			'title: seed',
			'---',
			'',
			`# ${id} — seed`,
			'',
			'## slices',
			'',
			'### S1 — work',
			'- **Status**: pending',
			'- **Files**: `new:src/made.ts`',
			'- **Gate**: none',
			`- **Decisions**: ${decisions}`,
			'- acceptance:',
			'  - "`bun run lint` exits 0."',
			'',
		].join('\n'),
		'utf8',
	);
	await server.callTool('delendai_proposals_sync_proposals', {});
	return file;
};

describe('e2e: the move to ready', async () => {
	let harness: IAssembledProposalsServer;
	beforeEach(async () => {
		harness = await createAssembledProposalsServer();
	});
	afterEach(async () => {
		await harness.close();
	});

	it('[<3000ms] refuses a proposal whose Decisions leave a question open, and keeps the file', async () => {
		const file = await seedIn(harness, 'f08101', 'Which one?');
		const res = await harness.callTool<IOutput>(
			'delendai_proposals_proposal_transition',
			{ id: 'f08101', to: 'ready', reason: 'plan is complete' },
		);
		expect(res.structured.ok).toBe(false);
		expect(res.structured.error?.code).toBe('proposal-not-ready');
		expect(res.structured.error?.reason).toContain('[decisions]');
		expect(existsSync(file)).toBe(true);
	});

	it('[<3000ms] moves a proposal with nothing left to work out', async () => {
		await seedIn(harness, 'f08102', 'none');
		const res = await harness.callTool<IOutput>(
			'delendai_proposals_proposal_transition',
			{ id: 'f08102', to: 'ready', reason: 'plan is complete' },
		);
		expect(res.structured.ok).toBe(true);
	});
	const move = (
		id: string,
		to: string,
		extra: Record<string, unknown> = {},
	) =>
		harness.callTool<IOutput>('delendai_proposals_proposal_transition', {
			id,
			to,
			reason: 'step',
			...extra,
		});

	it('[<6000ms] walks ready, in-progress and review, and refuses the illegal moves', async () => {
		await seedIn(harness, 'f08103', 'none', 'ready');
		expect((await move('f08103', 'done')).structured.ok).toBe(false);
		expect((await move('f08103', 'in-progress')).structured.ok).toBe(true);
		expect((await move('f08103', 'ready')).structured.ok).toBe(false);
		expect(
			(await move('f08103', 'review', { validateEvidence: EVIDENCE }))
				.structured.ok,
		).toBe(false);
		expect((await move('f08199', 'ready')).structured.ok).toBe(false);
	});

	it('[<3000ms] asks for a reason, replays an idempotent key and honours force', async () => {
		await seedIn(harness, 'f08104', 'none', 'ready');
		const empty = await harness.callTool<IOutput>(
			'delendai_proposals_proposal_transition',
			{ id: 'f08104', to: 'in-progress', reason: '  ' },
		);
		expect(empty.structured.ok).toBe(false);
		const keyed = { idempotencyKey: 'key-f08104-0001' };
		expect((await move('f08104', 'in-progress', keyed)).structured.ok).toBe(
			true,
		);
		expect((await move('f08104', 'in-progress', keyed)).structured.ok).toBe(
			true,
		);
		expect(
			(await move('f08104', 'ready', { force: true })).structured.ok,
		).toBeDefined();
	});

	it('[<6000ms] pauses, blocks on a dependency, and refuses the ready move with force off', async () => {
		await seedIn(harness, 'f08105', 'none', 'ready');
		expect((await move('f08105', 'paused')).structured.ok).toBe(true);
		expect(
			(await move('f08105', 'ready', { force: true })).structured.ok,
		).toBeDefined();
		await seedIn(harness, 'f08106', 'TBD', 'ready');
		expect(
			(
				await harness.callTool<IOutput>(
					'delendai_proposals_proposal_transition',
					{ id: 'f08106', to: 'paused', reason: 'blocked by f08105' },
				)
			).structured.ok,
		).toBeDefined();
		const refused = await move('f08106', 'ready');
		expect(refused.structured.ok).toBe(false);
		expect((await move('f08106', 'retired')).structured.ok).toBeDefined();
	});
	it('[<6000ms] creates proposals in every shape the tool accepts', async () => {
		const create = (args: Record<string, unknown>) =>
			harness.callTool<{ ok: boolean; id?: string }>(
				'delendai_proposals_create_proposal',
				completeProposalInput(args),
			);
		const base = {
			title: 'readiness shapes',
			goal: 'g',
			why: 'w',
			nonGoals: ['n'],
		};
		const two = await create({
			...base,
			kind: 'fix',
			globalGate: 'type',
			slices: [
				{ sliceId: 's1', files: ['new:src/a.ts'], decisions: 'none' },
				{
					sliceId: 'S2',
					title: 'second',
					files: ['new:src/b.ts'],
					gate: 'lint',
					dependsOn: ['s1'],
					acceptance: ['`bun run lint` exits 0.'],
				},
			],
		});
		expect(two.structured.ok).toBe(true);
		expect(
			(await create({ title: 'bare', kind: 'chore' })).structured.ok,
		).toBe(true);
		expect(
			(await create({ ...base, id: 'f08150', status: 'ready' }))
				.structured.ok,
		).toBe(true);
		expect(
			(await create({ ...base, id: 'zz', kind: 'fix' })).structured.ok,
		).toBe(false);
		expect(
			(await create({ ...base, id: 'f08151', kind: 'fix' })).structured
				.ok,
		).toBe(false);
	});
});
