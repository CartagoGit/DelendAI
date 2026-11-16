/**
 * End-to-end: the move to `ready` refuses a proposal with something left
 * to work out, and moves one with nothing left. Every test names its
 * budget.
 */
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { proposalFolderFor } from '@delendai/proposals/lib/contracts/proposal-folder-policy';

import {
	createAssembledProposalsServer,
	type IAssembledProposalsServer,
} from './assembled-proposals-server';

interface IOutput {
	readonly ok: boolean;
	readonly error?: { readonly reason: string; readonly code?: string };
}

const seedPaused = async (
	server: IAssembledProposalsServer,
	id: string,
	decisions: string,
): Promise<string> => {
	const dir = join(
		server.workspace,
		'docs/delendai/proposals',
		proposalFolderFor('paused', 'feat'),
	);
	mkdirSync(dir, { recursive: true });
	const file = join(dir, `${id}-seed.md`);
	writeFileSync(
		file,
		[
			'---',
			`id: ${id}`,
			'status: paused',
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
		const file = await seedPaused(harness, 'f08101', 'Which one?');
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
		await seedPaused(harness, 'f08102', 'none');
		const res = await harness.callTool<IOutput>(
			'delendai_proposals_proposal_transition',
			{ id: 'f08102', to: 'ready', reason: 'plan is complete' },
		);
		expect(res.structured.ok).toBe(true);
	});
});
