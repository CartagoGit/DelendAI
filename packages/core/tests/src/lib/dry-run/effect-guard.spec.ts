/**
 * effect-guard.spec.ts — f00189 follow-up (Track F / security).
 *
 * `enforce.ts`'s `enforceDryRunReturnContract` only rejects a
 * malformed response AFTER a handler has already run — a handler
 * that ignores `args.dryRun` still performs its mutation before
 * being told its response was wrong. These tests prove the stronger
 * property this module adds: a handler that ignores `dryRun`
 * entirely and unconditionally calls a guarded capability must be
 * PREVENTED from performing the effect, not merely rejected
 * afterwards.
 */

import {
	mkdtempSync,
	readFileSync,
	readdirSync,
	rmSync,
	writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
	DryRunEffectRefusedError,
	guardEffectCapability,
	runWithDryRunGate,
} from '@mcp-vertex/core/public';

describe('f00189 follow-up — guardEffectCapability prevents the mutation', () => {
	let workDir: string;

	beforeEach(() => {
		workDir = mkdtempSync(join(tmpdir(), 'mcp-vertex-dry-run-guard-'));
	});

	afterEach(() => {
		rmSync(workDir, { recursive: true, force: true });
	});

	/**
	 * A handler that IGNORES `args.dryRun` completely and always
	 * calls the capability it was handed. This is the exact failure
	 * mode the audit flagged: the handler has no dryRun-awareness of
	 * its own. The property under test is that the capability
	 * constructed with `dryRun: true` still refuses — the handler's
	 * carelessness is irrelevant.
	 */
	const carelessWriteHandler = (
		write: (path: string, content: string) => void,
	) => {
		write(join(workDir, 'output.txt'), 'real mutation');
	};

	it('never calls the real implementation while dryRun is true, even when the handler ignores dryRun', () => {
		const guardedWrite = guardEffectCapability<[string, string], void>({
			capability: 'write',
			dryRun: true,
			perform: (path, content) => writeFileSync(path, content, 'utf8'),
			describe: (path) => path,
		});

		expect(() => carelessWriteHandler(guardedWrite)).toThrow(
			DryRunEffectRefusedError,
		);
		// The proof: the file was never created. This is not a
		// rejected response after the fact — the write never reached
		// the filesystem at all.
		expect(readdirSync(workDir)).toEqual([]);
	});

	it('reports a typed refusal identifying the refused capability', () => {
		const guardedSpawn = guardEffectCapability<[string], void>({
			capability: 'spawn',
			dryRun: true,
			perform: () => {
				throw new Error('should never run');
			},
		});

		try {
			guardedSpawn('rm -rf something');
			throw new Error('expected guardedSpawn to throw');
		} catch (error) {
			expect(error).toBeInstanceOf(DryRunEffectRefusedError);
			const refusal = (error as DryRunEffectRefusedError).refusal;
			expect(refusal.kind).toBe('dry-run-effect-refused');
			expect(refusal.capability).toBe('spawn');
		}
	});

	it('passes through to the real implementation when dryRun is false', () => {
		const guardedWrite = guardEffectCapability<[string, string], void>({
			capability: 'write',
			dryRun: false,
			perform: (path, content) => writeFileSync(path, content, 'utf8'),
		});

		const target = join(workDir, 'output.txt');
		guardedWrite(target, 'real mutation');
		expect(readFileSync(target, 'utf8')).toBe('real mutation');
	});
});

describe('f00189 follow-up — runWithDryRunGate never invokes execute during a dry run', () => {
	it('does not call execute (and cannot reach its captured capabilities) while dryRun is true', async () => {
		let mutationsPerformed = 0;
		const execute = () => {
			mutationsPerformed += 1;
			return { ok: true };
		};

		const result = await runWithDryRunGate({
			dryRun: true,
			plan: () => ({
				dryRun: true as const,
				wouldChange: [
					{ kind: 'write' as const, path: '/a', summary: 'edit' },
				],
				wouldRun: [],
				risk: 'low' as const,
			}),
			execute,
		});

		expect(result).toEqual({
			dryRun: true,
			wouldChange: [{ kind: 'write', path: '/a', summary: 'edit' }],
			wouldRun: [],
			risk: 'low',
		});
		expect(mutationsPerformed).toBe(0);
	});

	it('calls execute (and not plan) when dryRun is false', async () => {
		let planCalls = 0;
		let executeCalls = 0;

		const result = await runWithDryRunGate({
			dryRun: false,
			plan: () => {
				planCalls += 1;
				return {
					dryRun: true as const,
					wouldChange: [],
					wouldRun: [],
					risk: 'low' as const,
				};
			},
			execute: () => {
				executeCalls += 1;
				return { ok: true };
			},
		});

		expect(result).toEqual({ ok: true });
		expect(executeCalls).toBe(1);
		expect(planCalls).toBe(0);
	});
});
