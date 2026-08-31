import { describe, expect, it } from 'vitest';

import { evaluateWorktreeImpactPolicy } from '@mcp-vertex/proposals/lib/agents/worktree-impact-policy';

describe('evaluateWorktreeImpactPolicy', async () => {
	it('keeps a single-surface expand change on the shared checkout', async () => {
		const result = evaluateWorktreeImpactPolicy({
			phase: 'expand',
			touchedPaths: [
				'packages/core/src/lib/contracts/interfaces/project-profile.interface.ts',
			],
		});
		expect(result.impact).toBe('low');
		expect(result.isolation).toBe('shared-checkout');
		expect(result.claimMode).toBe('shared-checkout-ok');
	});

	it('treats a small expand contract+producer change as medium, not mandatory isolation', async () => {
		const result = evaluateWorktreeImpactPolicy({
			phase: 'expand',
			touchedPaths: [
				'packages/core/src/lib/contracts/interfaces/project-profile.interface.ts',
				'plugins/proposals/src/lib/swarm/proposal-slice-plan.ts',
			],
		});
		expect(result.impact).toBe('medium');
		expect(result.isolation).toBe('shared-checkout');
		expect(result.claimMode).toBe('shared-checkout-ok');
		expect(result.contractTouchCount).toBe(1);
		expect(result.areaCount).toBe(2);
	});

	it('escalates regenerate fan-out to an agent worktree', async () => {
		const result = evaluateWorktreeImpactPolicy({
			phase: 'regenerate',
			touchedPaths: [
				'packages/core/src/lib/contracts/interfaces/project-profile.interface.ts',
				'plugins/proposals/src/lib/swarm/proposal-slice-plan.ts',
				'plugins/proposals/src/lib/agents/agent-worktree-engine.ts',
				'plugins/proposals/tests/src/lib/swarm/proposal-slice-plan.spec.ts',
			],
		});
		expect(result.impact).toBe('high');
		expect(result.isolation).toBe('agent-worktree');
		expect(result.claimMode).toBe('requires-agent-worktree');
		expect(result.reasons.join(' ')).toContain('late migration phase');
	});

	it('escalates high file-count fan-out regardless of phase', async () => {
		const result = evaluateWorktreeImpactPolicy({
			phase: 'producers',
			touchedPaths: [
				'packages/core/src/lib/contracts/interfaces/a.interface.ts',
				'packages/core/src/lib/contracts/interfaces/b.interface.ts',
				'plugins/proposals/src/lib/swarm/a.ts',
				'plugins/proposals/src/lib/swarm/b.ts',
				'plugins/proposals/src/lib/agents/a.ts',
				'plugins/proposals/tests/src/lib/swarm/a.spec.ts',
			],
		});
		expect(result.fileCount).toBe(6);
		expect(result.impact).toBe('high');
		expect(result.isolation).toBe('agent-worktree');
		expect(result.claimMode).toBe('requires-agent-worktree');
		expect(result.reasons.join(' ')).toContain('threshold 6');
	});

	it('escalates contract-phase multi-area changes before removing legacy surfaces', async () => {
		const result = evaluateWorktreeImpactPolicy({
			phase: 'contract',
			touchedPaths: [
				'packages/core/src/lib/contracts/interfaces/project-profile.interface.ts',
				'packages/core/src/lib/contracts/interfaces/host-config.interface.ts',
				'plugins/proposals/src/lib/swarm/contract-migration-policy.ts',
			],
		});
		expect(result.impact).toBe('high');
		expect(result.isolation).toBe('agent-worktree');
		expect(result.claimMode).toBe('requires-agent-worktree');
		expect(result.reasons.join(' ')).toContain(
			'multiple contract surfaces',
		);
	});

	it('escalates verify fan-out once verification spans contract and consumer surfaces', async () => {
		const result = evaluateWorktreeImpactPolicy({
			phase: 'verify',
			touchedPaths: [
				'packages/core/src/lib/contracts/interfaces/project-profile.interface.ts',
				'plugins/proposals/src/lib/swarm/proposal-slice-plan.ts',
				'plugins/proposals/src/lib/agents/agent-worktree-engine.ts',
				'plugins/proposals/tests/src/lib/continue-proposal.spec.ts',
			],
		});
		expect(result.impact).toBe('high');
		expect(result.isolation).toBe('agent-worktree');
		expect(result.claimMode).toBe('requires-agent-worktree');
		expect(result.reasons.join(' ')).toContain('late migration phase');
	});
});
