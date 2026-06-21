import { describe, expect, it } from 'vitest';

import {
	deriveSliceStatuses,
	parseProposalSlicePlan,
	planDisjointnessIssues,
	validateClaim,
} from '@mcp-vertex/proposals/lib/swarm/proposal-slice-plan';

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

describe('parseProposalSlicePlan', () => {
	it('returns null for legacy proposals without a Slices section', () => {
		expect(parseProposalSlicePlan('pY', '# pY\n\n## Description\n')).toBe(
			null,
		);
	});

	it('parses slices with files, deps, gates, acceptance and doc status', () => {
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

	it('also treats markdown bold status lines as done slices', () => {
		const plan = parseProposalSlicePlan('pX', DOC_WITH_BOLD_STATUS);
		expect(plan?.slices[0]?.status).toBe('done');
		expect(validateClaim(plan!, 'pX.S1').blockerType).toBe('already-done');
	});

	it('flags overlapping files between slices', () => {
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
});

describe('deriveSliceStatuses + validateClaim', () => {
	const plan = parseProposalSlicePlan('pX', DOC)!;

	it('derives in-progress (and owner) from the live lock snapshot', () => {
		const derived = deriveSliceStatuses(plan, [
			{ taskId: 'pX.S2', agent: 'implementation_runner' },
		]);
		expect(derived.slices[1]?.status).toBe('in-progress');
		expect(derived.slices[1]?.owner).toBe('implementation_runner');
		// doc-level done always wins
		expect(derived.slices[0]?.status).toBe('done');
	});

	it('accepts a claim whose deps are done', () => {
		expect(validateClaim(plan, 'pX.S2').ok).toBe(true);
	});

	it('rejects unknown, done, in-progress, missing-deps and overlap claims', () => {
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
});
