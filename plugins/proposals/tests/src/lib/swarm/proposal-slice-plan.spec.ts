import { describe, expect, it } from 'vitest';

import { CONTRACT_MIGRATION_PHASES } from '@delendai/core/lib/contracts';
import {
	deriveSliceStatuses,
	parseProposalSlicePlan,
	planDisjointnessIssues,
	validateClaim,
} from '@delendai/proposals/lib/swarm/proposal-slice-plan';

const DOC = `---
id: pX
---

# [PROPOSAL] pX — something

## Description

Prose.

## Slices

- global_gate: type

### pX.S1 — contract

- files: libs/a/contract.ts
- files: libs/a/contract.spec.ts
- gate: type
- depends_on: []
- acceptance:
    - "bun run typecheck:a"
- status: done

### pX.S2 — tool wiring

- files: libs/a/tool.ts
- gate: type
- depends_on: [pX.S1]
- acceptance:
    - "bun run typecheck:a"
    - "bun test a -- tools"

### pX.S3 — docs

- files: docs/pX.md
- gate: none
- depends_on: [pX.S2]

## Rollback

Prose after the section.
`;

const DOC_WITH_BOLD_STATUS = DOC.replace(
	'- status: done',
	'- **Status**: done',
);

const DOC_WITH_SIMPLE_SLICE_IDS = `---
id: f00020
---

# f00020

## Slices

### S1 — first

- files: docs/a.md
- status: done

### S2 — second

- files: docs/b.md

### S3 — third

- files: docs/c.md
`;

const DOC_WITH_BOLD_FIELDS = `---
id: f00020
---

# f00020

## Slices

### S12 — aggregator

- **Files**: \`packages/core/src/public/index.ts\`
- **Files**: \`plugins/quality/src/lib/run-all.ts\`
- **Gate**: type

### S13 — hygiene

- **Files**: \`packages/client/README.md\`
- **Gate**: lint
`;

describe('parseProposalSlicePlan', async () => {
	it('returns null for legacy proposals without a Slices section', async () => {
		expect(parseProposalSlicePlan('pY', '# pY\n\n## Description\n')).toBe(
			null,
		);
	});

	it('parses slices with files, deps, gates, acceptance and doc status', async () => {
		const plan = parseProposalSlicePlan('pX', DOC);
		expect(plan).not.toBeNull();
		expect(plan?.globalGate).toBe('type');
		expect(plan?.slices.map((slice) => slice.sliceId)).toEqual([
			'pX.S1',
			'pX.S2',
			'pX.S3',
		]);
		const s1 = plan?.slices[0];
		expect(s1?.files).toEqual([
			'libs/a/contract.ts',
			'libs/a/contract.spec.ts',
		]);
		expect(s1?.status).toBe('done');
		expect(s1?.acceptanceCriteria).toEqual(['bun run typecheck:a']);
		const s2 = plan?.slices[1];
		expect(s2?.dependsOn).toEqual(['pX.S1']);
		expect(s2?.acceptanceCriteria).toHaveLength(2);
		expect(plan?.slices[2]?.gate).toBe('none');
	});

	it('also treats markdown bold status lines as done slices', async () => {
		const plan = parseProposalSlicePlan('pX', DOC_WITH_BOLD_STATUS);
		expect(plan?.slices[0]?.status).toBe('done');
		expect(validateClaim(plan!, 'pX.S1').blockerType).toBe('already-done');
	});

	it('ignores leftover markdown list tokens in Files bullets', async () => {
		const plan = parseProposalSlicePlan(
			'x00001',
			`# x00001

## Slices

### x00001-s1 — Fix
- **Files**:
    - \`[\`
    - [sync-proposal-registry.ts#L311](file:///tmp/plugins/proposals/src/lib/proposals/sync-proposal-registry.ts#L311)
- **Gate**: none
`,
		);
		expect(plan?.slices[0]?.files).toEqual([
			'plugins/proposals/src/lib/proposals/sync-proposal-registry.ts',
		]);
	});

	it('parses narrative bold field labels used by live proposal docs', async () => {
		const plan = parseProposalSlicePlan('f00020', DOC_WITH_BOLD_FIELDS);
		expect(plan?.slices[0]?.files).toEqual([
			'packages/core/src/public/index.ts',
			'plugins/quality/src/lib/run-all.ts',
		]);
		expect(plan?.slices[0]?.gate).toBe('type');
		expect(plan?.slices[1]?.files).toEqual(['packages/client/README.md']);
		expect(plan?.slices[1]?.gate).toBe('lint');
	});

	it('keeps multiline Files continuations byte-identical in the parsed output', async () => {
		const plan = parseProposalSlicePlan(
			'x00298',
			[
				'## Slices',
				'',
				'### x00298.S3 — multiline files',
				'- **Files**:',
				'  - `packages/core/src/public/index.ts`',
				'  - [run-all.ts](file:///tmp/plugins/quality/src/lib/run-all.ts#L10)',
				'- **Gate**: type',
				'',
			].join('\n'),
		);
		expect(plan).toEqual({
			proposalId: 'x00298',
			globalGate: 'none',
			slices: [
				{
					proposalId: 'x00298',
					sliceId: 'x00298.S3',
					title: 'multiline files',
					owner: null,
					files: [
						'packages/core/src/public/index.ts',
						'plugins/quality/src/lib/run-all.ts',
					],
					dependsOn: [],
					gate: 'type',
					status: 'pending',
					acceptanceCriteria: [],
				},
			],
		});
	});

	it('parses a long indented Files block without changing the extracted paths', async () => {
		const declared = Array.from(
			{ length: 64 },
			(_, index) =>
				`  - \`docs/stress/file-${index.toString().padStart(2, '0')}.md\``,
		);
		const plan = parseProposalSlicePlan(
			'x00298',
			[
				'## Slices',
				'',
				'### x00298.S3 — stress files',
				'- **Files**:',
				...declared,
				'- **Gate**: none',
				'',
			].join('\n'),
		);
		expect(plan?.slices[0]?.files).toHaveLength(64);
		expect(plan?.slices[0]?.files[0]).toBe('docs/stress/file-00.md');
		expect(plan?.slices[0]?.files[63]).toBe('docs/stress/file-63.md');
	});

	it('flags overlapping files between slices', async () => {
		const doc = DOC.replace(
			'- files: docs/pX.md',
			'- files: libs/a/tool.ts',
		);
		const plan = parseProposalSlicePlan('pX', doc);
		const issues = planDisjointnessIssues(plan!);
		expect(issues).toEqual([
			{ first: 'pX.S2', second: 'pX.S3', file: 'libs/a/tool.ts' },
		]);
	});

	// a00069 S1 — the scaffold linter already accepts lowercase and
	// narrative `## 5. Slices (...)` headers; the slice planner must
	// see the same three forms so `continue_proposal { mode: "plan" }`
	// does not return `has no ## Slices section`.
	it('parses lowercase ## slices headers (a00069 S1)', async () => {
		const lower = DOC.replace('## Slices', '## slices');
		const plan = parseProposalSlicePlan('pX', lower);
		expect(plan).not.toBeNull();
		expect(plan?.globalGate).toBe('type');
		expect(plan?.slices.map((slice) => slice.sliceId)).toEqual([
			'pX.S1',
			'pX.S2',
			'pX.S3',
		]);
	});

	it('parses narrative ## N. Slices (alias) headers (a00069 S1)', async () => {
		const narrative = DOC.replace(
			'## Slices',
			'## 5. Slices (following the disjoint pattern)',
		);
		const plan = parseProposalSlicePlan('pX', narrative);
		expect(plan).not.toBeNull();
		expect(plan?.globalGate).toBe('type');
		expect(plan?.slices).toHaveLength(3);
		expect(plan?.slices[0]?.files).toEqual([
			'libs/a/contract.ts',
			'libs/a/contract.spec.ts',
		]);
	});

	it('still parses the canonical ## Slices header (a00069 S1)', async () => {
		const plan = parseProposalSlicePlan('pX', DOC);
		expect(plan).not.toBeNull();
		expect(plan?.slices).toHaveLength(3);
	});
});

const DOC_WITH_ROUTING_HINTS = `---
id: f00099
---

# f00099

## Slices

### S1 — list form

- files: libs/a/a.ts
- requires_capability: [code-edit, fast-iteration]
- preferred_provider: openrouter-minimax
- max_cost_tier: 3

### S2 — single bare token + bold labels

- **Files**: libs/b/b.ts
- **Requires Capability**: reasoning
- **Max Cost Tier**: 5

### S3 — backward compat (no routing hints)

- files: libs/c/c.ts
- gate: type

### S4 — unknown capability tokens are dropped

- files: libs/d/d.ts
- requires_capability: [code-edit, not-a-real-tag]
- max_cost_tier: 9
`;

const DOC_WITH_MIGRATION_PHASES = `---
id: r00044
---

# r00044

## Slices

### S1 — expand

- files: packages/core/src/lib/contracts/interfaces/project-profile.interface.ts
- migration_phase: expand
- status: done

### S2 — producers

- files: plugins/proposals/src/lib/swarm/contract-migration-policy.ts
- migration_phase: producers
- status: done

### S3 — regenerate

- files: packages/core/src/lib/contracts/interfaces/project-profile.interface.ts
- migration_phase: regenerate
- status: done

### S4 — consumers

- files: plugins/proposals/src/lib/swarm/proposal-slice-plan.ts
- migration_phase: consumers
- status: done

### S5 — verify fanout

- files: packages/core/src/lib/contracts/interfaces/project-profile.interface.ts
- files: plugins/proposals/src/lib/swarm/proposal-slice-plan.ts
- files: plugins/proposals/src/lib/agents/agent-worktree-engine.ts
- files: plugins/proposals/tests/src/lib/continue-proposal.spec.ts
- migration_phase: verify
- gate: type

### S6 — contract cleanup

- files: packages/core/src/lib/contracts/interfaces/project-profile.interface.ts
- files: plugins/proposals/src/lib/swarm/contract-migration-policy.ts
- migration_phase: contract
- gate: type
`;

const DOC_WITH_VERIFY_DONE = DOC_WITH_MIGRATION_PHASES.replace(
	'### S5 — verify fanout\n\n- files: packages/core/src/lib/contracts/interfaces/project-profile.interface.ts\n- files: plugins/proposals/src/lib/swarm/proposal-slice-plan.ts\n- files: plugins/proposals/src/lib/agents/agent-worktree-engine.ts\n- files: plugins/proposals/tests/src/lib/continue-proposal.spec.ts\n- migration_phase: verify\n- gate: type\n',
	'### S5 — verify fanout\n\n- files: packages/core/src/lib/contracts/interfaces/project-profile.interface.ts\n- files: plugins/proposals/src/lib/swarm/proposal-slice-plan.ts\n- files: plugins/proposals/src/lib/agents/agent-worktree-engine.ts\n- files: plugins/proposals/tests/src/lib/continue-proposal.spec.ts\n- migration_phase: verify\n- gate: type\n- status: done\n',
);

describe('parseProposalSlicePlan — f00067 S2 routing hints', async () => {
	const plan = parseProposalSlicePlan('f00099', DOC_WITH_ROUTING_HINTS)!;

	it('parses the YAML-list capability form + provider + cost tier', async () => {
		const s1 = plan.slices[0];
		expect(s1?.requiresCapability).toEqual(['code-edit', 'fast-iteration']);
		expect(s1?.preferredProvider).toBe('openrouter-minimax');
		expect(s1?.maxCostTier).toBe(3);
	});

	it('parses a single bare capability token via bold field labels', async () => {
		const s2 = plan.slices[1];
		expect(s2?.requiresCapability).toEqual(['reasoning']);
		expect(s2?.maxCostTier).toBe(5);
		expect(s2?.preferredProvider).toBeUndefined();
	});

	it('leaves the fields undefined for slices with no routing hints (backward compat)', async () => {
		const s3 = plan.slices[2];
		expect(s3?.requiresCapability).toBeUndefined();
		expect(s3?.preferredProvider).toBeUndefined();
		expect(s3?.maxCostTier).toBeUndefined();
		// existing fields still parse
		expect(s3?.files).toEqual(['libs/c/c.ts']);
		expect(s3?.gate).toBe('type');
	});

	it('drops unknown capability tags and out-of-range cost tiers', async () => {
		const s4 = plan.slices[3];
		expect(s4?.requiresCapability).toEqual(['code-edit']);
		expect(s4?.maxCostTier).toBeUndefined();
	});

	it('does not regress the legacy corpus fixture (zero new fields on DOC)', async () => {
		const legacy = parseProposalSlicePlan('pX', DOC)!;
		for (const slice of legacy.slices) {
			expect(slice.migrationPhase).toBeUndefined();
			expect(slice.migrationGuidance).toBeUndefined();
			expect(slice.requiresCapability).toBeUndefined();
			expect(slice.preferredProvider).toBeUndefined();
			expect(slice.maxCostTier).toBeUndefined();
		}
	});

	it('attaches migration guidance and escalates verify fan-out to an agent worktree', async () => {
		const plan = parseProposalSlicePlan(
			'r00044',
			DOC_WITH_MIGRATION_PHASES,
		)!;
		const verifySlice = plan.slices.find((slice) => slice.sliceId === 'S5');
		expect(verifySlice?.migrationPhase).toBe('verify');
		expect(verifySlice?.migrationGuidance?.completedPhases).toEqual([
			'expand',
			'producers',
			'regenerate',
			'consumers',
		]);
		expect(verifySlice?.migrationGuidance?.migrationPolicy.ok).toBe(true);
		expect(
			verifySlice?.migrationGuidance?.worktreeImpactPolicy.isolation,
		).toBe('agent-worktree');
		expect(
			verifySlice?.migrationGuidance?.worktreeImpactPolicy.claimMode,
		).toBe('requires-agent-worktree');
		expect(
			verifySlice?.migrationGuidance?.worktreeImpactPolicy.reasons.join(
				' ',
			),
		).toContain('late migration phase');
	});

	it('reuses the core barrel export for migration phase ordering', async () => {
		expect(CONTRACT_MIGRATION_PHASES).toEqual([
			'expand',
			'producers',
			'regenerate',
			'consumers',
			'verify',
			'contract',
		]);
		const plan = parseProposalSlicePlan(
			'r00044',
			DOC_WITH_MIGRATION_PHASES,
		)!;
		const verifySlice = plan.slices.find((slice) => slice.sliceId === 'S5');
		expect(verifySlice?.migrationGuidance?.completedPhases).toEqual(
			CONTRACT_MIGRATION_PHASES.slice(0, 4),
		);
	});
});

describe('deriveSliceStatuses + validateClaim', async () => {
	const plan = parseProposalSlicePlan('pX', DOC)!;

	it('derives in-progress (and owner) from the live lock snapshot', async () => {
		const derived = deriveSliceStatuses(plan, [
			{ taskId: 'pX.S2', agent: 'implementation_runner' },
		]);
		expect(derived.slices[1]?.status).toBe('in-progress');
		expect(derived.slices[1]?.owner).toBe('implementation_runner');
		// doc-level done always wins
		expect(derived.slices[0]?.status).toBe('done');
	});

	it('treats grouped proposal task ids as covering each referenced slice', async () => {
		const groupedPlan = parseProposalSlicePlan(
			'f00020',
			DOC_WITH_SIMPLE_SLICE_IDS,
		)!;
		const derived = deriveSliceStatuses(groupedPlan, [
			{ taskId: 'f00020-S2-S3', agent: 'copilot' },
		]);
		expect(derived.slices[1]?.status).toBe('in-progress');
		expect(derived.slices[1]?.owner).toBe('copilot');
		expect(derived.slices[2]?.status).toBe('in-progress');
		expect(derived.slices[2]?.owner).toBe('copilot');
	});

	it('treats ownership overlap as in-progress even when the grouped task id omits the exact slice id', async () => {
		const plan = parseProposalSlicePlan('f00020', DOC_WITH_BOLD_FIELDS)!;
		const derived = deriveSliceStatuses(plan, [
			{
				taskId: 'f00020-S11-S13',
				agent: 'hydra',
				ownership: ['plugins/quality/src/lib/run-all.ts'],
			},
		]);
		expect(derived.slices[0]?.status).toBe('in-progress');
		expect(derived.slices[0]?.owner).toBe('hydra');
	});

	it('accepts a claim whose deps are done', async () => {
		expect(validateClaim(plan, 'pX.S2').ok).toBe(true);
	});

	it('rejects unknown, done, in-progress, missing-deps and overlap claims', async () => {
		expect(validateClaim(plan, 'pX.S9').blockerType).toBe('unknown-slice');
		expect(validateClaim(plan, 'pX.S1').blockerType).toBe('already-done');
		expect(validateClaim(plan, 'pX.S3').blockerType).toBe('deps-not-done');
		const busy = deriveSliceStatuses(plan, [
			{ taskId: 'pX.S2', agent: 'runner' },
		]);
		expect(validateClaim(busy, 'pX.S2').blockerType).toBe(
			'already-in-progress',
		);
		const overlapping = parseProposalSlicePlan(
			'pX',
			DOC.replace(
				'- files: docs/pX.md',
				'- files: libs/a/tool.ts',
			).replace('- depends_on: [pX.S2]', '- depends_on: []'),
		)!;
		const withBusy = deriveSliceStatuses(overlapping, [
			{ taskId: 'pX.S2', agent: 'runner' },
		]);
		expect(validateClaim(withBusy, 'pX.S3').blockerType).toBe(
			'overlap-in-progress',
		);
	});

	it('blocks contract claims until verify is done, then still requires isolation for high-impact phases', async () => {
		const plan = parseProposalSlicePlan(
			'r00044',
			DOC_WITH_MIGRATION_PHASES,
		)!;
		expect(validateClaim(plan, 'S6')).toEqual({
			ok: false,
			blockerType: 'migration-phase-blocked',
			reason: 'contract requires prior verify in EXPAND -> PRODUCERS -> REGENERATE -> CONSUMERS -> VERIFY -> CONTRACT order. contract requires successful verify evidence before the legacy surface can be removed.',
		});
		const verified = parseProposalSlicePlan(
			'r00044',
			DOC_WITH_VERIFY_DONE,
		)!;
		expect(validateClaim(verified, 'S6')).toEqual({
			ok: false,
			blockerType: 'isolation-required',
			reason: 'slice "S6" is contract with high fan-out and requires agent-worktree isolation before claim. Use an isolated orchestration path (delegate or create an agent/<name> worktree) instead of the shared checkout.',
		});
	});

	it('blocks verify claims that require agent-worktree isolation', async () => {
		const plan = parseProposalSlicePlan(
			'r00044',
			DOC_WITH_MIGRATION_PHASES,
		)!;
		expect(validateClaim(plan, 'S5')).toEqual({
			ok: false,
			blockerType: 'isolation-required',
			reason: 'slice "S5" is verify with high fan-out and requires agent-worktree isolation before claim. Use an isolated orchestration path (delegate or create an agent/<name> worktree) instead of the shared checkout.',
		});
	});
});

describe('canonical **Files** lists (x00098 S1)', async () => {
	const docWith = (filesLine: string): string =>
		[
			'## Slices',
			'',
			'- global_gate: none',
			'',
			'### S1 — canonical',
			'- **Status**: pending',
			filesLine,
			'- **Gate**: bun run validate',
			'',
		].join('\n');

	it('splits a backticked comma list into individual paths', async () => {
		const plan = parseProposalSlicePlan(
			'x1',
			docWith('- **Files**: `a/b.ts`, `c/d.spec.ts`, `e.md`'),
		);
		expect(plan?.slices[0]?.files).toEqual([
			'a/b.ts',
			'c/d.spec.ts',
			'e.md',
		]);
	});

	it('splits a bracket-wrapped list into individual paths', async () => {
		const plan = parseProposalSlicePlan(
			'x1',
			docWith('- **Files**: [a/b.ts, c/d.ts]'),
		);
		expect(plan?.slices[0]?.files).toEqual(['a/b.ts', 'c/d.ts']);
	});

	it('keeps single-path repeatable lines byte-identical', async () => {
		const plan = parseProposalSlicePlan(
			'x1',
			[
				'## Slices',
				'',
				'### S1 — legacy',
				'- files: a/b.ts',
				'- files: c/d.ts',
				'- gate: none',
				'- status: pending',
				'',
			].join('\n'),
		);
		expect(plan?.slices[0]?.files).toEqual(['a/b.ts', 'c/d.ts']);
	});

	// x00158 S1 — the naive `unwrapped.split(',')` used to shatter a
	// `{a,b,c}` brace expansion into 3 garbage fragments
	// (`"{resumes"`, `"chores"`, `"audits}/* (...)"`). Pins the x00155 S1
	// `Files:` line to its correct 4-entry expansion.
	it('expands brace-group Files: lines instead of garbage-splitting on every comma (x00155 S1 regression)', async () => {
		const plan = parseProposalSlicePlan(
			'x00155',
			[
				'## Slices',
				'',
				'### S1 — mass status sync',
				'- **Status**: pending',
				'- **Files**:',
				'  - `docs/delendai/proposals/done/{resumes,chores,audits}/*` (frontmatter + slice rows in those proposals only)',
				'  - `tools/scripts/proposals/sync-proposal-registry.script.ts` (re-run at the end)',
				'- **Gate**: bun tools/scripts/lint/proposals.script.ts',
				'',
			].join('\n'),
		);
		expect(plan?.slices[0]?.files).toEqual([
			'docs/delendai/proposals/done/resumes/*',
			'docs/delendai/proposals/done/chores/*',
			'docs/delendai/proposals/done/audits/*',
			'tools/scripts/proposals/sync-proposal-registry.script.ts',
		]);
	});
});
