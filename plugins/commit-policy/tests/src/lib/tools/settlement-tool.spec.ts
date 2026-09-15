/**
 * settlement-tool.spec.ts — the status / enter / complete steering calls,
 * against a real registry file so the tool and the engine's gate can be
 * pointed at the same state.
 */

import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createSettlementTool } from '@delendai/commit-policy/lib/tools/settlement-tool';
import { createWorkerRegistry } from '@delendai/commit-policy/lib/settlement/worker.registry';

const FILE = '.cache/delendai/commit-policy/settlement.json';

describe('createSettlementTool', () => {
	let workspace = '';

	beforeEach(async () => {
		workspace = await mkdtemp(join(tmpdir(), 'settlement-tool-'));
	});

	afterEach(async () => {
		await rm(workspace, { recursive: true, force: true });
	});

	it('reports the phase and worker count of the registry it is pointed at', async () => {
		const registry = createWorkerRegistry({
			workspaceRoot: workspace,
			fileRel: FILE,
		});
		await registry.register('agent-a');
		const tool = createSettlementTool({
			workspaceRoot: workspace,
			fileRel: FILE,
		});
		expect(await tool.status()).toEqual({
			phase: 'active',
			activeWorkers: 1,
		});
	});

	it('refuses to enter settlement while a worker is still active', async () => {
		const registry = createWorkerRegistry({
			workspaceRoot: workspace,
			fileRel: FILE,
		});
		await registry.register('agent-a');
		const tool = createSettlementTool({
			workspaceRoot: workspace,
			fileRel: FILE,
		});
		expect(await tool.enter({})).toEqual({
			ack: 'REFUSED',
			reason: 'cannot enter SETTLING while 1 worker(s) are still active',
		});
		expect((await registry.read()).phase).toBe('active');
	});

	it('enters settlement once every worker has left', async () => {
		const tool = createSettlementTool({
			workspaceRoot: workspace,
			fileRel: FILE,
		});
		expect(await tool.enter({ reason: 'round finished' })).toEqual({
			ack: 'OK',
			phase: 'settling',
		});
		expect((await tool.status()).phase).toBe('settling');
	});

	it('goes stable on a green validate and records the head', async () => {
		const tool = createSettlementTool({
			workspaceRoot: workspace,
			fileRel: FILE,
		});
		await tool.enter({});
		expect(
			await tool.complete({ green: true, headSha: 'abcdef1' }),
		).toEqual({
			ack: 'OK',
			phase: 'stable',
		});
		expect(await tool.status()).toEqual({
			phase: 'stable',
			activeWorkers: 0,
			lastGreenHead: 'abcdef1',
		});
	});

	it('stays settling and asks for a repair on a red validate', async () => {
		const tool = createSettlementTool({
			workspaceRoot: workspace,
			fileRel: FILE,
		});
		await tool.enter({});
		expect(
			await tool.complete({ green: false, headSha: 'abcdef1' }),
		).toEqual({
			ack: 'REPAIR_REQUIRED',
			phase: 'settling',
		});
	});

	it('defaults to the registry file when no path is given', async () => {
		const tool = createSettlementTool({ workspaceRoot: workspace });
		expect((await tool.status()).phase).toBe('active');
	});
});
