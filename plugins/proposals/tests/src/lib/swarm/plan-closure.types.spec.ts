/**
 * plan-closure.types.spec.ts
 *
 * Tests for the types module's pure helpers (no I/O):
 *   - `policyFromFrontmatter` — frontmatter → IPlanClosureGatePolicy
 *   - `DEFAULT_CLOSURE_GATE_POLICY` — the canonical defaults
 *
 * Acceptance:
 *   - Empty frontmatter → all defaults (true, true, true).
 *   - Explicit `false` overrides the default.
 *   - YAML-quirky values (1/0, "yes"/"no", etc.) coerce correctly.
 *   - Unrecognised strings fall back to the default (never throws).
 */

import { describe, expect, it } from 'vitest';

import type { IProposalFrontmatter } from '@mcp-vertex/proposals/lib/proposals/proposal-document';
import {
	DEFAULT_CLOSURE_GATE_POLICY,
	policyFromFrontmatter,
} from '@mcp-vertex/proposals/lib/swarm/plan-closure.types';

const fmWith = (
	closureGate: Record<string, unknown> | undefined,
): IProposalFrontmatter => {
	const base: IProposalFrontmatter = {
		id: 'q00001',
		type: 'plan',
		status: 'ready',
		track: 'test',
	};
	if (closureGate === undefined) {
		return {
			...base,
			closureGate: undefined,
		} as unknown as IProposalFrontmatter;
	}
	return {
		...base,
		closureGate: closureGate as IProposalFrontmatter['closureGate'],
	} as unknown as IProposalFrontmatter;
};

describe('policyFromFrontmatter', async () => {
	it('returns the canonical defaults when closureGate is absent', async () => {
		const policy = policyFromFrontmatter(fmWith(undefined));
		expect(policy).toEqual({
			requirePeerReview: true,
			requireAllSlicesDone: true,
			requireAllChildrenDone: true,
		});
	});

	it('returns the canonical defaults when all flags are missing', async () => {
		const policy = policyFromFrontmatter(fmWith({}));
		expect(policy).toEqual(DEFAULT_CLOSURE_GATE_POLICY);
	});

	it('respects explicit false values', async () => {
		const policy = policyFromFrontmatter(
			fmWith({
				requirePeerReview: false,
				requireAllSlicesDone: false,
				requireAllChildrenDone: false,
			}),
		);
		expect(policy).toEqual({
			requirePeerReview: false,
			requireAllSlicesDone: false,
			requireAllChildrenDone: false,
		});
	});

	it('coerces YAML-quirky booleans (1, 0, "yes", "no")', async () => {
		const policy = policyFromFrontmatter(
			fmWith({
				requirePeerReview: 1,
				requireAllSlicesDone: 0,
				requireAllChildrenDone: 'yes',
			}),
		);
		expect(policy.requirePeerReview).toBe(true);
		expect(policy.requireAllSlicesDone).toBe(false);
		expect(policy.requireAllChildrenDone).toBe(true);
	});

	it('falls back to the default for unrecognised string values', async () => {
		const policy = policyFromFrontmatter(
			fmWith({
				requirePeerReview: 'maybe',
			}),
		);
		// 'maybe' is not in the truthy/falsy list → default (true).
		expect(policy.requirePeerReview).toBe(true);
	});

	it('treats null and undefined as missing (uses default)', async () => {
		const policy = policyFromFrontmatter(
			fmWith({
				requirePeerReview: null,
				requireAllSlicesDone: undefined,
			}),
		);
		expect(policy.requirePeerReview).toBe(true);
		expect(policy.requireAllSlicesDone).toBe(true);
	});
});
