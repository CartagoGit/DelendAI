/**
 * plan-closure.spec.ts
 *
 * Unit tests for `evaluatePlanClosure`. Pure in-memory — no disk, no
 * network. The resolver is injected (DIP) so the suite can express each
 * closure scenario as a small Map.
 *
 * Acceptance (mirrors q00001):
 *   - returns `closable: false` when any child proposal is in-progress
 *   - returns `closable: false` when any child slice is pending
 *   - returns `closable: true` when all children done + peer-reviewed
 *   - detects a self-reference cycle and returns a `self-cycle` reason
 *   - recurses into sub-plans (parent.closable requires sub-plan closable)
 *   - mixed scenario: proposal + sub-plan + own slice all open
 */

import { describe, expect, it } from 'vitest';

import type { IProposalFrontmatter } from '@mcp-vertex/proposals/lib/proposals/proposal-document';
import {
	buildInMemoryResolver,
	evaluatePlanClosure,
} from '@mcp-vertex/proposals/lib/swarm/plan-closure';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const PLAN_ID = 'q00001';

const baseFrontmatter = (
	overrides: Partial<IProposalFrontmatter> = {},
): IProposalFrontmatter => ({
	id: PLAN_ID,
	type: 'plan',
	status: 'in-progress',
	track: 'proposals-plugin',
	...overrides,
});

const proposalRef = (id: string, required = true) => ({
	id,
	required,
	kind: 'feat',
});
const planRef = (id: string) => ({ id, kind: 'plan' });
const sliceRef = (id: string) => ({ id, kind: 'feat', title: id });

// ---------------------------------------------------------------------------
// 1. In-progress child proposal blocks closure
// ---------------------------------------------------------------------------

describe('evaluatePlanClosure — child proposal status', () => {
	it('returns closable=false when a contained proposal is in-progress', async () => {
		const fm = baseFrontmatter({
			contains: {
				proposals: [proposalRef('f00050')],
			},
		});
		const resolver = buildInMemoryResolver({
			proposals: new Map([['f00050', { status: 'in-progress' }]]),
		});
		const report = await evaluatePlanClosure({
			planId: PLAN_ID,
			frontmatter: fm,
			resolver,
		});
		expect(report.closable).toBe(false);
		expect(report.reasons).toHaveLength(1);
		expect(report.reasons[0]?.ref).toBe('f00050');
		expect(report.reasons[0]?.code).toBe('not-done');
		expect(report.children).toHaveLength(1);
	});

	it('returns closable=true when every contained proposal is done + peer-reviewed', async () => {
		const fm = baseFrontmatter({
			contains: {
				proposals: [proposalRef('f00050'), proposalRef('f00049')],
			},
		});
		const resolver = buildInMemoryResolver({
			proposals: new Map([
				['f00050', { status: 'done', peerReviewed: true }],
				['f00049', { status: 'done', peerReviewed: true }],
			]),
		});
		const report = await evaluatePlanClosure({
			planId: PLAN_ID,
			frontmatter: fm,
			resolver,
		});
		expect(report.closable).toBe(true);
		expect(report.reasons).toEqual([]);
		expect(report.children).toHaveLength(2);
	});

	it('returns closable=false when a contained proposal is not peer-reviewed', async () => {
		const fm = baseFrontmatter({
			contains: {
				proposals: [proposalRef('f00050')],
			},
		});
		const resolver = buildInMemoryResolver({
			proposals: new Map([
				['f00050', { status: 'done', peerReviewed: false }],
			]),
		});
		const report = await evaluatePlanClosure({
			planId: PLAN_ID,
			frontmatter: fm,
			resolver,
		});
		expect(report.closable).toBe(false);
		expect(report.reasons[0]?.code).toBe('not-peer-reviewed');
	});

	it('treats legacy proposals (no peerReviewed field) as reviewed', async () => {
		const fm = baseFrontmatter({
			contains: {
				proposals: [proposalRef('f00050')],
			},
		});
		const resolver = buildInMemoryResolver({
			proposals: new Map([['f00050', { status: 'done' }]]),
		});
		const report = await evaluatePlanClosure({
			planId: PLAN_ID,
			frontmatter: fm,
			resolver,
		});
		expect(report.closable).toBe(true);
	});
});

// ---------------------------------------------------------------------------
// 2. Own slices block closure
// ---------------------------------------------------------------------------

describe('evaluatePlanClosure — own slices', () => {
	it('returns closable=false when a referenced own slice is pending', async () => {
		const fm = baseFrontmatter({
			contains: {
				slices: [sliceRef('qs1')],
			},
		});
		const resolver = buildInMemoryResolver({
			slices: new Map([['qs1', { status: 'pending' }]]),
		});
		const report = await evaluatePlanClosure({
			planId: PLAN_ID,
			frontmatter: fm,
			resolver,
		});
		expect(report.closable).toBe(false);
		expect(report.reasons[0]?.ref).toBe('qs1');
		expect(report.reasons[0]?.code).toBe('not-done');
	});

	it('returns closable=true when every own slice is done', async () => {
		const fm = baseFrontmatter({
			contains: {
				slices: [sliceRef('qs1'), sliceRef('qs2')],
			},
		});
		const resolver = buildInMemoryResolver({
			slices: new Map([
				['qs1', { status: 'done' }],
				['qs2', { status: 'done' }],
			]),
		});
		const report = await evaluatePlanClosure({
			planId: PLAN_ID,
			frontmatter: fm,
			resolver,
		});
		expect(report.closable).toBe(true);
	});
});

// ---------------------------------------------------------------------------
// 3. Sub-plan recursion + cycle detection
// ---------------------------------------------------------------------------

describe('evaluatePlanClosure — sub-plans', () => {
	it('recurses into a sub-plan and surfaces its open children as reasons', async () => {
		const subPlanFm: IProposalFrontmatter = {
			id: 'q00002',
			type: 'plan',
			status: 'in-progress',
			track: 'proposals-plugin',
			contains: {
				proposals: [proposalRef('f00051')],
			},
		};
		const parentFm = baseFrontmatter({
			contains: {
				plans: [planRef('q00002')],
			},
		});
		const resolver = buildInMemoryResolver({
			proposals: new Map<
				string,
				{
					status: string;
					peerReviewed?: boolean;
					frontmatter?: IProposalFrontmatter;
				}
			>([
				['q00002', { status: 'in-progress', frontmatter: subPlanFm }],
				['f00051', { status: 'in-progress' }],
			]),
		});
		const report = await evaluatePlanClosure({
			planId: PLAN_ID,
			frontmatter: parentFm,
			resolver,
		});
		expect(report.closable).toBe(false);
		// Two reasons: the sub-plan itself is not-done, AND the nested
		// proposal inside the sub-plan is not-done.
		const refs = report.reasons.map((r) => r.ref);
		expect(refs).toContain('q00002');
		expect(refs).toContain('f00051');
	});

	it('detects a self-reference cycle and returns self-cycle reasons', async () => {
		// The sub-plan's own contains.plans points back to the parent —
		// this is the classic a → b → a cycle.
		const subPlanFm: IProposalFrontmatter = {
			id: 'q00002',
			type: 'plan',
			status: 'in-progress',
			track: 'proposals-plugin',
			contains: {
				plans: [planRef(PLAN_ID)],
			},
		};
		const parentFm = baseFrontmatter({
			contains: {
				plans: [planRef('q00002')],
			},
		});
		const resolver = buildInMemoryResolver({
			proposals: new Map([
				['q00002', { status: 'in-progress', frontmatter: subPlanFm }],
			]),
		});
		const report = await evaluatePlanClosure({
			planId: PLAN_ID,
			frontmatter: parentFm,
			resolver,
		});
		expect(report.closable).toBe(false);
		// Exactly one self-cycle reason (the parent's attempt to descend
		// into q00002 is allowed; the nested attempt to descend back into
		// the parent is rejected).
		const cycles = report.reasons.filter((r) => r.code === 'self-cycle');
		expect(cycles.length).toBeGreaterThanOrEqual(1);
		expect(report.depth).toBeLessThan(16);
	});

	it('returns closable=true when the sub-plan is fully done + the parent is empty', async () => {
		const subPlanFm: IProposalFrontmatter = {
			id: 'q00002',
			type: 'plan',
			status: 'done',
			track: 'proposals-plugin',
			contains: {
				proposals: [proposalRef('f00051')],
			},
		};
		const parentFm = baseFrontmatter({
			contains: {
				plans: [planRef('q00002')],
			},
		});
		const resolver = buildInMemoryResolver({
			proposals: new Map<
				string,
				{
					status: string;
					peerReviewed?: boolean;
					frontmatter?: IProposalFrontmatter;
				}
			>([
				['q00002', { status: 'done', frontmatter: subPlanFm }],
				['f00051', { status: 'done', peerReviewed: true }],
			]),
		});
		const report = await evaluatePlanClosure({
			planId: PLAN_ID,
			frontmatter: parentFm,
			resolver,
		});
		expect(report.closable).toBe(true);
		expect(report.reasons).toEqual([]);
	});
});

// ---------------------------------------------------------------------------
// 4. Mixed scenario + closureGate override
// ---------------------------------------------------------------------------

describe('evaluatePlanClosure — mixed + closureGate', () => {
	it('aggregates reasons from proposals, sub-plans and own slices', async () => {
		const subPlanFm: IProposalFrontmatter = {
			id: 'q00002',
			type: 'plan',
			status: 'in-progress',
			track: 'proposals-plugin',
			contains: { proposals: [proposalRef('f00051')] },
		};
		const fm = baseFrontmatter({
			contains: {
				proposals: [proposalRef('f00050')],
				plans: [planRef('q00002')],
				slices: [sliceRef('qs1')],
			},
		});
		const resolver = buildInMemoryResolver({
			proposals: new Map<
				string,
				{
					status: string;
					peerReviewed?: boolean;
					frontmatter?: IProposalFrontmatter;
				}
			>([
				['f00050', { status: 'in-progress' }],
				['q00002', { status: 'in-progress', frontmatter: subPlanFm }],
				['f00051', { status: 'in-progress' }],
			]),
			slices: new Map([['qs1', { status: 'pending' }]]),
		});
		const report = await evaluatePlanClosure({
			planId: PLAN_ID,
			frontmatter: fm,
			resolver,
		});
		expect(report.closable).toBe(false);
		const refs = report.reasons.map((r) => r.ref).sort();
		expect(refs).toEqual(['f00050', 'f00051', 'q00002', 'qs1']);
	});

	it('respects closureGate.requirePeerReview=false', async () => {
		const fm = baseFrontmatter({
			contains: { proposals: [proposalRef('f00050')] },
			closureGate: { requirePeerReview: false },
		});
		const resolver = buildInMemoryResolver({
			proposals: new Map([
				['f00050', { status: 'done', peerReviewed: false }],
			]),
		});
		const report = await evaluatePlanClosure({
			planId: PLAN_ID,
			frontmatter: fm,
			resolver,
		});
		expect(report.closable).toBe(true);
	});

	it('respects closureGate.requireAllChildrenDone=false', async () => {
		const fm = baseFrontmatter({
			contains: { proposals: [proposalRef('f00050')] },
			closureGate: { requireAllChildrenDone: false },
		});
		const resolver = buildInMemoryResolver({
			proposals: new Map([['f00050', { status: 'in-progress' }]]),
		});
		const report = await evaluatePlanClosure({
			planId: PLAN_ID,
			frontmatter: fm,
			resolver,
		});
		expect(report.closable).toBe(true);
	});
});
