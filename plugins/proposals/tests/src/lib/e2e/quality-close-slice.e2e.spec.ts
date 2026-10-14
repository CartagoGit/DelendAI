import { readFileSync, rmSync } from 'node:fs';
import { waitUntil } from '@delendai/test-kit';
import { afterEach, describe, expect, it } from 'vitest';

import {
	createQualityServer,
	findProposalPath,
	seedSlice,
	syncProposals,
	workspaces,
} from './quality-close-slice.harness';

afterEach(async () => {
	for (const workspace of workspaces.splice(0))
		rmSync(workspace, { recursive: true, force: true });
});

describe('e2e: proposals close_slice + quality gate', () => {
	it('keeps the slice pending when the quality scope fails', async () => {
		const { workspace, client, project } =
			await createQualityServer('false');
		try {
			seedSlice(workspace, 'f04200');
			const sync = await syncProposals(client);
			expect(sync.isError).toBeFalsy();
			const plan = await client.callTool({
				name: 'delendai_proposals_auto_work',
				arguments: {},
			});
			expect(plan.isError).toBeFalsy();
			expect(plan.structuredContent).toMatchObject({
				state: 'work',
				proposalId: 'f04200',
			});
			const sliceClaim = await client.callTool({
				name: 'delendai_proposals_agent_lock',
				arguments: {
					action: 'claim',
					task_id: 'f04200-S1',
					agent: 'agent-quality-e2e',
					files: ['src/quality.ts'],
				},
			});
			expect(sliceClaim.isError).toBeFalsy();
			const quality = await client.callTool({
				name: 'delendai_quality_quality_run_all',
				arguments: {},
			});
			expect(quality.structuredContent).toMatchObject({
				summary: { ok: false },
			});
			const result = await client.callTool({
				name: 'delendai_proposals_close_slice',
				arguments: {
					proposalId: 'f04200',
					sliceId: 'S1',
					force: true,
				},
			});
			expect(result.structuredContent).toMatchObject({
				ok: false,
				closed: false,
				blockerType: 'quality-failed',
			});
			expect(
				readFileSync(
					await findProposalPath(workspace, 'f04200'),
					'utf8',
				),
			).toContain('- **Status**: pending');
		} finally {
			await client.close();
			await project.server.close();
		}
	});

	it('marks the slice done when the quality scope passes', async () => {
		const { workspace, client, project } =
			await createQualityServer('true');
		try {
			seedSlice(workspace, 'f04201');
			const sync = await syncProposals(client);
			expect(sync.isError).toBeFalsy();
			const plan = await client.callTool({
				name: 'delendai_proposals_auto_work',
				arguments: {},
			});
			expect(plan.isError).toBeFalsy();
			expect(plan.structuredContent).toMatchObject({
				state: 'work',
				proposalId: 'f04201',
			});
			const sliceClaim = await client.callTool({
				name: 'delendai_proposals_agent_lock',
				arguments: {
					action: 'claim',
					task_id: 'f04201-S1',
					agent: 'agent-quality-e2e',
					files: ['src/quality.ts'],
				},
			});
			expect(sliceClaim.isError).toBeFalsy();
			const quality = await client.callTool({
				name: 'delendai_quality_quality_run_all',
				arguments: {},
			});
			expect(quality.isError).toBeFalsy();
			expect(quality.structuredContent).toMatchObject({
				summary: { ok: true },
			});
			const result = await client.callTool({
				name: 'delendai_proposals_close_slice',
				arguments: {
					proposalId: 'f04201',
					sliceId: 'S1',
					force: true,
				},
			});
			expect(
				result.isError,
				`close_slice: ${JSON.stringify(result).slice(0, 500)}`,
			).toBeFalsy();
			expect(result.structuredContent).toMatchObject({
				ok: true,
				closed: true,
			});
			expect(
				readFileSync(
					await findProposalPath(workspace, 'f04201'),
					'utf8',
				),
			).toContain('- **Status**: done');
		} finally {
			await client.close();
			await project.server.close();
		}
	});

	it('answers pending with a handle while a slow gate runs, then closes on resume', async () => {
		const { workspace, client, project } = await createQualityServer(
			'true',
			{ validate: 'sleep 2', closeGateWaitMs: 100 },
		);
		try {
			seedSlice(workspace, 'f04202');
			expect((await syncProposals(client)).isError).toBeFalsy();
			const claim = await client.callTool({
				name: 'delendai_proposals_agent_lock',
				arguments: {
					action: 'claim',
					task_id: 'f04202-S1',
					agent: 'agent-quality-e2e',
					files: ['src/quality.ts'],
				},
			});
			expect(claim.isError).toBeFalsy();
			const close = () =>
				client.callTool({
					name: 'delendai_proposals_close_slice',
					arguments: {
						proposalId: 'f04202',
						sliceId: 'S1',
						force: true,
					},
				});

			const first = await close();

			expect(first.structuredContent).toMatchObject({
				ok: false,
				closed: false,
				blockerType: 'gate-pending',
				gate: { state: 'pending' },
			});
			expect(
				readFileSync(
					await findProposalPath(workspace, 'f04202'),
					'utf8',
				),
			).toContain('- **Status**: pending');

			let resumed = first;
			await waitUntil(
				'the resumed gate finishes and close_slice stops answering pending',
				async () => {
					resumed = await close();
					return resumed.isError !== true;
				},
				{ timeoutMs: 20_000, intervalMs: 250 },
			);

			expect(resumed.structuredContent).toMatchObject({
				ok: true,
				closed: true,
			});
		} finally {
			await client.close();
			await project.server.close();
		}
	}, 30_000);
});
