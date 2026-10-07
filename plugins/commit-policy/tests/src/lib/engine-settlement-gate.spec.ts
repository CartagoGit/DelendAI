/**
 * engine-settlement-gate.spec.ts — q00015 S2.
 *
 * While a round is `settling`, the engine refuses slice commits so the
 * settlement run sees a quiet branch. The slices that repair a red
 * settlement are the exception, or the round could never finish.
 *
 * The gate runs before the engine touches git, so the runner's call log
 * is the precise signal: a refused slice makes no git call at all, and a
 * slice past the gate starts with the branch lookup that follows it.
 */

import { describe, expect, it } from 'vitest';

import type { IGitRunner, IGitRunResult } from '@delendai/core/public';

import { DEFAULT_BRANCH_POLICY } from '@delendai/commit-policy/lib/contracts/branch';
import type { ICommitPolicyOptions } from '@delendai/commit-policy/lib/contracts/options';
import { createCommitPolicyEngine } from '@delendai/commit-policy/lib/engine';

const BRANCH_LOOKUP = 'rev-parse --abbrev-ref HEAD';

const policy: ICommitPolicyOptions = {
	gitTimeoutMs: 60_000,
	commit: {
		enabled: true,
		requireConventional: true,
		autoScopeFromProposal: true,
		refuseWhenDisabled: true,
	},
	stash: { enabled: false },
	identity: { mode: 'global' },
	audit: { trailer: 'none', agentFormat: '${host}/${model}' },
	cadence: {
		triggers: [],
		sliceScoping: true,
		allowForeignChanges: false,
		quietPeriodMs: 0,
	},
	push: {
		enabled: false,
		onCommit: false,
		force: 'with-lease',
		protectedBranches: ['main'],
	},
};

const engineWith = (settlement: {
	readonly phase?: 'active' | 'settling' | 'stable';
	readonly exempt?: (slice: {
		readonly proposalId: string;
		readonly sliceId: string;
	}) => boolean;
}) => {
	const calls: string[] = [];
	// Answers only the branch lookup; everything after it fails, so no
	// case below can ever produce a commit.
	const run: IGitRunner = (args) => {
		calls.push(args.join(' '));
		return Promise.resolve<IGitRunResult>(
			args.join(' ') === BRANCH_LOOKUP
				? { ok: true, output: 'feature/repair\n' }
				: { ok: false, output: '', reason: 'not stubbed' },
		);
	};
	const engine = createCommitPolicyEngine({
		driver: {
			run,
			policy,
			identityCtx: { run, envVars: Object.freeze({}) },
			auditAgent: null,
		},
		branchPolicy: DEFAULT_BRANCH_POLICY,
		...(settlement.phase !== undefined
			? {
					settlementRead: () =>
						Promise.resolve(settlement.phase ?? 'stable'),
				}
			: {}),
		...(settlement.exempt !== undefined
			? { settlementExempt: settlement.exempt }
			: {}),
	});
	return { engine, calls };
};

const slice = (proposalId: string, eventId: string) => ({
	kind: 'slice' as const,
	proposalId,
	sliceId: 'S1',
	files: ['src/fixed.ts'],
	eventId,
});

const isRepair = (candidate: { readonly proposalId: string }): boolean =>
	candidate.proposalId.startsWith('e');

describe('settlement gate (q00015 S2)', () => {
	it('refuses an ordinary slice while settling, before touching git', async () => {
		const { engine, calls } = engineWith({
			phase: 'settling',
			exempt: isRepair,
		});
		const result = await engine.handle(slice('f00001', 'ordinary'));
		expect(result).toMatchObject({
			ack: 'ERR',
			code: 'SETTLEMENT_IN_PROGRESS',
		});
		expect(calls).toEqual([]);
	});

	it('lets a slice the host exempts past the gate', async () => {
		const seen: string[] = [];
		const { engine, calls } = engineWith({
			phase: 'settling',
			exempt: (candidate) => {
				seen.push(`${candidate.proposalId}-${candidate.sliceId}`);
				return isRepair(candidate);
			},
		});
		const result = await engine.handle(slice('e00001', 'repair'));
		expect(seen).toEqual(['e00001-S1']);
		expect(calls[0]).toBe(BRANCH_LOOKUP);
		expect(result).not.toMatchObject({ code: 'SETTLEMENT_IN_PROGRESS' });
		expect(result).toMatchObject({ committed: false });
	});

	it('refuses every slice during settlement when the host names no exemption', async () => {
		const { engine, calls } = engineWith({ phase: 'settling' });
		const result = await engine.handle(slice('e00001', 'no-rule'));
		expect(result).toMatchObject({ code: 'SETTLEMENT_IN_PROGRESS' });
		expect(calls).toEqual([]);
	});

	it('does not gate, or consult the exemption, outside settlement', async () => {
		for (const phase of ['active', 'stable'] as const) {
			let consulted = 0;
			const { engine, calls } = engineWith({
				phase,
				exempt: () => {
					consulted += 1;
					return false;
				},
			});
			await engine.handle(slice('f00001', `outside-${phase}`));
			expect(calls[0]).toBe(BRANCH_LOOKUP);
			expect(consulted).toBe(0);
		}
	});

	it('keeps the historical behaviour when the host reads no settlement phase', async () => {
		const { engine, calls } = engineWith({});
		await engine.handle(slice('f00001', 'no-phase'));
		expect(calls[0]).toBe(BRANCH_LOOKUP);
	});
});
