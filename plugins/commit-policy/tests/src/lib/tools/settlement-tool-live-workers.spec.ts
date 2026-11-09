/**
 * settlement-tool-live-workers.spec.ts — the settlement tool counting
 * agents that hold live claims in the shared agent lock, through an
 * injected source, so status, enter and the dry run can be pinned without
 * writing a lock file.
 */

import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
	createSettlementTool,
	runCommitPolicySettlementTool,
} from '@delendai/commit-policy/lib/tools/settlement-tool';
import { createWorkerRegistry } from '@delendai/commit-policy/lib/settlement/worker.registry';

const FILE = '.cache/delendai/commit-policy/settlement.json';

describe('settlement with live agent-lock claims', () => {
	let workspace = '';

	beforeEach(async () => {
		workspace = await mkdtemp(join(tmpdir(), 'settlement-live-'));
	});

	afterEach(async () => {
		await rm(workspace, { recursive: true, force: true });
	});

	const toolWith = (live: number | null) =>
		createSettlementTool({
			workspaceRoot: workspace,
			fileRel: FILE,
			liveWorkers: async () => live,
		});

	it('counts agents holding live claims even when none registered', async () => {
		const tool = toolWith(2);
		expect(await tool.status()).toEqual({
			phase: 'active',
			activeWorkers: 2,
		});
		expect(await tool.enter({})).toEqual({
			ack: 'REFUSED',
			reason: 'cannot enter SETTLING while 2 worker(s) are still active',
		});
		expect((await tool.status()).phase).toBe('active');
	});

	it('takes the larger of registered workers and live claims', async () => {
		await createWorkerRegistry({
			workspaceRoot: workspace,
			fileRel: FILE,
		}).register('agent-a');
		expect((await toolWith(0).status()).activeWorkers).toBe(1);
	});

	it('enters settlement once no live claim remains', async () => {
		expect(await toolWith(0).enter({})).toEqual({
			ack: 'OK',
			phase: 'settling',
		});
	});

	it('refuses to enter while the shared lock cannot be read', async () => {
		const tool = toolWith(null);
		expect(await tool.status()).toEqual({
			phase: 'active',
			activeWorkers: 0,
			liveClaimsReadable: false,
		});
		expect(await tool.enter({})).toMatchObject({
			ack: 'REFUSED',
			reason: expect.stringContaining('could not be read'),
		});
		expect((await tool.status()).phase).toBe('active');
		const dry = await runCommitPolicySettlementTool(tool, {
			action: 'enter',
			dryRun: true,
		});
		expect(dry.structuredContent).toMatchObject({
			dryRun: true,
			wouldEnter: false,
			liveClaimsReadable: false,
		});
	});
});
