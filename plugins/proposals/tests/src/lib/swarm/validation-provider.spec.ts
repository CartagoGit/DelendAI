import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { buildCloseSliceValidationProvider } from '../../../../src/lib/swarm/validation-provider';
import type { IScopeMap } from '@delendai/quality/public';

const SCOPES: IScopeMap = {
	proposals: [{ command: 'echo scoped', expect: 'exit0' }],
	all: [{ command: 'echo full', expect: 'exit0' }],
};

describe('buildCloseSliceValidationProvider (f00386 S2)', () => {
	let root = '';

	afterEach(() => {
		if (root !== '') rmSync(root, { recursive: true, force: true });
	});

	const setup = (inFlight: readonly unknown[]): string => {
		root = mkdtempSync(join(tmpdir(), 'validation-provider-'));
		writeFileSync(
			join(root, 'registry.json'),
			JSON.stringify({ assignments: [] }),
			'utf8',
		);
		writeFileSync(
			join(root, 'locks.json'),
			JSON.stringify({ in_flight: inFlight }),
			'utf8',
		);
		return root;
	};

	const lock = (taskId: string, agent: string, file: string) => ({
		task_id: taskId,
		agent,
		ownership: [file],
		last_seen: new Date().toISOString(),
	});

	it('resolves scoped while another actor holds an active lock', async () => {
		const rootPath = setup([
			lock('f00386-S3', 'owl', 'plugins/proposals/src/lib/x.ts'),
			lock('f00386-S2', 'falcon', 'plugins/demo/src/index.ts'),
		]);
		const provider = buildCloseSliceValidationProvider({
			workspaceRoot: rootPath,
			registryPathAbs: join(rootPath, 'registry.json'),
			lockPathAbs: join(rootPath, 'locks.json'),
			worktreesDirAbs: rootPath,
			scopes: SCOPES,
		});
		const decision = await provider({
			operation: 'close',
			ownedFiles: ['plugins/proposals/src/lib/x.ts'],
			proposalId: 'f00386',
			sliceId: 's3',
		});
		expect(decision.mode).toBe('scoped');
		expect(decision.resolvedScopes).toEqual(['proposals']);
		expect(decision.activeAgents).toBe(2);
		expect(decision.snapshotId).not.toBe('');
	});

	it('requires the full gate when this close is the last active actor', async () => {
		const rootPath = setup([
			lock('f00386-S3', 'owl', 'plugins/proposals/src/lib/x.ts'),
		]);
		const provider = buildCloseSliceValidationProvider({
			workspaceRoot: rootPath,
			registryPathAbs: join(rootPath, 'registry.json'),
			lockPathAbs: join(rootPath, 'locks.json'),
			worktreesDirAbs: rootPath,
			scopes: SCOPES,
		});
		const decision = await provider({
			operation: 'close',
			ownedFiles: ['plugins/proposals/src/lib/x.ts'],
			proposalId: 'f00386',
			sliceId: 's3',
		});
		expect(decision.mode).toBe('full');
		expect(decision.resolvedScopes).toEqual(['all']);
		expect(decision.activeAgents).toBe(1);
	});

	it('blocks when the current actor cannot be proven active', async () => {
		const rootPath = setup([
			lock('f00386-S2', 'falcon', 'plugins/demo/src/index.ts'),
		]);
		const provider = buildCloseSliceValidationProvider({
			workspaceRoot: rootPath,
			registryPathAbs: join(rootPath, 'registry.json'),
			lockPathAbs: join(rootPath, 'locks.json'),
			worktreesDirAbs: rootPath,
			scopes: SCOPES,
		});
		const decision = await provider({
			operation: 'close',
			ownedFiles: ['plugins/proposals/src/lib/x.ts'],
			proposalId: 'f00386',
			sliceId: 's3',
		});
		expect(decision.mode).toBe('blocked');
		expect(decision.blockingReasons.join(' ')).toMatch(
			/not provably active|active current actor/i,
		);
	});
});
