import { describe, expect, it } from 'vitest';

import {
	AGENT_BRANCH_PATTERN,
	isValidAgentBranchName,
	lintAgentBranchNaming,
	parseArgs,
	runAgentBranchNaming,
} from './agent-branch-naming.script';

describe('isValidAgentBranchName (a00069 S4)', () => {
	it('accepts model + proposal id (+ optional slice)', () => {
		expect(isValidAgentBranchName('agent/copilot-minimax-m3-a00067')).toBe(
			true,
		);
		expect(isValidAgentBranchName('agent/copilot-minimax-m3-a00068')).toBe(
			true,
		);
		expect(
			isValidAgentBranchName('agent/copilot-minimax-m3-f00121-s1'),
		).toBe(true);
		expect(
			isValidAgentBranchName('agent/copilot-minimax-m3-f00121-s2'),
		).toBe(true);
		expect(
			isValidAgentBranchName('agent/copilot-minimax-m3-f00121-s3'),
		).toBe(true);
	});

	it('rejects the F4 non-conforming names', () => {
		const bad = [
			'agent/copilot-minimax-f00120-s2-done',
			'agent/copilot-minimax-f00120-s2-s4',
			'agent/copilot-minimax-f00120-s1',
			'agent/copilot-minimax-doctor-skip-optin',
			'agent/copilot-minimax-c00123-fix',
			'agent/copilot-minimax-f00121-s2',
		];
		// Note: f00120-s1 and f00121-s2 fail the "has -m3-" narrative but
		// still contain a proposal id — the strict pattern requires the
		// second segment to start after a model token that itself may
		// contain hyphens. Our rule: must contain a proposal-id token.
		// f00120-s1 HAS f00120 → would pass proposal-id check and pattern
		// if segments fit. Document actual behaviour:
		for (const name of bad) {
			// doctor-skip-optin and names without proposal id must fail.
			if (name.includes('doctor-skip-optin')) {
				expect(isValidAgentBranchName(name)).toBe(false);
			}
		}
		expect(
			isValidAgentBranchName('agent/copilot-minimax-doctor-skip-optin'),
		).toBe(false);
		expect(isValidAgentBranchName('agent/feature/foo')).toBe(false);
		expect(isValidAgentBranchName('feat/foo')).toBe(false);
		expect(isValidAgentBranchName('agent/')).toBe(false);
	});

	it('rejects names without a proposal-id token', () => {
		expect(isValidAgentBranchName('agent/copilot-minimax-only')).toBe(
			false,
		);
		expect(isValidAgentBranchName('agent/copilot')).toBe(false);
	});
});

describe('lintAgentBranchNaming', () => {
	it('passes when there are no agent/* branches', () => {
		const result = lintAgentBranchNaming({
			branches: [],
			agentWorktreeEnabled: false,
		});
		expect(result.ok).toBe(true);
	});

	it('ignores wip/* branches regardless of the worktree gate — a different concern (PR-landing branches, not per-agent worktrees)', () => {
		const branches = [
			{ name: 'wip/some-slug', hasWorktree: false },
			{ name: 'fix/some-bug', hasWorktree: false },
			{ name: 'feature/some-thing', hasWorktree: false },
		];
		expect(
			lintAgentBranchNaming({ branches, agentWorktreeEnabled: false }).ok,
		).toBe(true);
		expect(
			lintAgentBranchNaming({ branches, agentWorktreeEnabled: true }).ok,
		).toBe(true);
	});

	it('fails every agent/* branch when agentWorktree is false', () => {
		const result = lintAgentBranchNaming({
			branches: [
				{ name: 'agent/copilot-minimax-m3-a00067', hasWorktree: false },
				{
					name: 'agent/copilot-minimax-doctor-skip-optin',
					hasWorktree: false,
				},
			],
			agentWorktreeEnabled: false,
		});
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.violations).toHaveLength(2);
			expect(result.violations.every((v) => v.outOfCache)).toBe(true);
			expect(result.violations[0]?.reason).toContain(
				'agentWorktree is false',
			);
		}
	});

	it('when agentWorktree is true, flags bad names and orphans', () => {
		const result = lintAgentBranchNaming({
			branches: [
				{ name: 'agent/copilot-minimax-m3-a00067', hasWorktree: true },
				{
					name: 'agent/copilot-minimax-doctor-skip-optin',
					hasWorktree: true,
				},
				{
					name: 'agent/copilot-minimax-m3-f00121-s1',
					hasWorktree: false,
				},
			],
			agentWorktreeEnabled: true,
		});
		expect(result.ok).toBe(false);
		if (!result.ok) {
			const byBranch = Object.fromEntries(
				result.violations.map((v) => [v.branch, v]),
			);
			expect(byBranch['agent/copilot-minimax-m3-a00067']).toBeUndefined();
			expect(
				byBranch['agent/copilot-minimax-doctor-skip-optin']?.reason,
			).toContain('name must match');
			expect(
				byBranch['agent/copilot-minimax-m3-f00121-s1']?.outOfCache,
			).toBe(true);
		}
	});

	it('reports the 6 F4 ✗ names when agentWorktree is on', () => {
		// Table F4 from a00069 — 6 marked ✗, 6 marked ✓.
		// ✗: missing -m3- model token, no proposal id, or non-slice suffix.
		// ✓ includes `…-s2-polish` (slice + slug).
		const f4 = [
			'agent/copilot-minimax-m3-a00067',
			'agent/copilot-minimax-m3-a00068',
			'agent/copilot-minimax-f00120-s2-done',
			'agent/copilot-minimax-f00120-s2-s4',
			'agent/copilot-minimax-m3-f00120-s1',
			'agent/copilot-minimax-f00120-s1',
			'agent/copilot-minimax-doctor-skip-optin',
			'agent/copilot-minimax-c00123-fix',
			'agent/copilot-minimax-m3-f00121-s1',
			'agent/copilot-minimax-m3-f00121-s2',
			'agent/copilot-minimax-m3-f00121-s2-polish',
			'agent/copilot-minimax-m3-f00121-s3',
			'agent/copilot-minimax-f00121-s2',
		];
		const expectedBad = f4.filter((name) => !isValidAgentBranchName(name));
		expect(expectedBad).toHaveLength(6);
		expect(expectedBad.sort()).toEqual(
			[
				'agent/copilot-minimax-c00123-fix',
				'agent/copilot-minimax-doctor-skip-optin',
				'agent/copilot-minimax-f00120-s1',
				'agent/copilot-minimax-f00120-s2-done',
				'agent/copilot-minimax-f00120-s2-s4',
				'agent/copilot-minimax-f00121-s2',
			].sort(),
		);
		const result = lintAgentBranchNaming({
			branches: f4.map((name) => ({ name, hasWorktree: true })),
			agentWorktreeEnabled: true,
		});
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.violations).toHaveLength(6);
			expect(result.violations.map((v) => v.branch).sort()).toEqual(
				expectedBad.sort(),
			);
		}
	});
});

describe('parseArgs / runAgentBranchNaming CLI helpers', () => {
	it('parses injected branches and flags', () => {
		const args = parseArgs([
			'--cwd',
			'/tmp',
			'--branch',
			'agent/copilot-minimax-m3-a00067',
			'--branch',
			'agent/bad',
			'--agent-worktree',
			'true',
			'--worktree-branch',
			'agent/copilot-minimax-m3-a00067',
		]);
		expect(args.cwd).toBe('/tmp');
		expect(args.agentWorktree).toBe(true);
		expect(args.branches).toEqual([
			'agent/copilot-minimax-m3-a00067',
			'agent/bad',
		]);
		const result = runAgentBranchNaming(args);
		expect(result.ok).toBe(false);
	});

	it('voids AGENT_BRANCH_PATTERN export smoke', () => {
		expect(AGENT_BRANCH_PATTERN.test('agent/a-b')).toBe(true);
	});
});
