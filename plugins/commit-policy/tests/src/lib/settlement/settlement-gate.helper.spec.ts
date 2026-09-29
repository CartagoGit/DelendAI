/**
 * settlement-gate.helper.spec.ts — q00015 S2 wiring.
 *
 * Reads the phase from a real worker registry on disk, and names which
 * slices the gate lets through while a round is settling.
 */

import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { CommitPolicyOptionsSchema } from '@delendai/commit-policy/lib/contracts/options';
import { createSettlementGate } from '@delendai/commit-policy/lib/settlement/settlement-gate.helper';
import { createWorkerRegistry } from '@delendai/commit-policy/lib/settlement/worker.registry';

const FILE = '.cache/delendai/commit-policy/settlement.json';

describe('createSettlementGate', () => {
	let workspace = '';

	beforeEach(async () => {
		workspace = await mkdtemp(join(tmpdir(), 'settlement-gate-'));
	});

	afterEach(async () => {
		await rm(workspace, { recursive: true, force: true });
	});

	const registry = () =>
		createWorkerRegistry({ workspaceRoot: workspace, fileRel: FILE });

	it('reads active when no settlement ever happened, so nothing is gated', async () => {
		const gate = createSettlementGate({ registry: registry() });
		expect(await gate.settlementRead()).toBe('active');
	});

	it('reads the phase the registry holds', async () => {
		const store = registry();
		const gate = createSettlementGate({ registry: store });
		await store.setPhase('settling');
		expect(await gate.settlementRead()).toBe('settling');
		await store.markGreen('abcdef1234');
		expect(await gate.settlementRead()).toBe('stable');
	});

	it('exempts repair proposals by default', () => {
		const gate = createSettlementGate({ registry: registry() });
		expect(
			gate.settlementExempt({ proposalId: 'e00001', sliceId: 'S1' }),
		).toBe(true);
		expect(
			gate.settlementExempt({ proposalId: 'f00001', sliceId: 'S1' }),
		).toBe(false);
	});

	it('uses the configured prefixes instead of the default, including none', () => {
		const configured = createSettlementGate({
			registry: registry(),
			exemptProposalIdPrefixes: ['x'],
		});
		expect(
			configured.settlementExempt({
				proposalId: 'x00001',
				sliceId: 'S1',
			}),
		).toBe(true);
		expect(
			configured.settlementExempt({
				proposalId: 'e00001',
				sliceId: 'S1',
			}),
		).toBe(false);
		const none = createSettlementGate({
			registry: registry(),
			exemptProposalIdPrefixes: [],
		});
		expect(
			none.settlementExempt({ proposalId: 'e00001', sliceId: 'S1' }),
		).toBe(false);
	});

	it('is configured through plugins.commit-policy.options.settlement', () => {
		expect(
			CommitPolicyOptionsSchema.parse({
				settlement: { exemptProposalIdPrefixes: ['e', 'x'] },
			}).settlement,
		).toEqual({ exemptProposalIdPrefixes: ['e', 'x'] });
		expect(CommitPolicyOptionsSchema.parse({}).settlement).toBeUndefined();
		expect(
			CommitPolicyOptionsSchema.safeParse({
				settlement: { exemptProposalIdPrefixes: [''] },
			}).success,
		).toBe(false);
	});
});
