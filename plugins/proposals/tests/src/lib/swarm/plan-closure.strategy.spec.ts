/**
 * plan-closure.strategy.spec.ts
 *
 * Tests for the strategy module:
 *   - `withOwnSlices` — decorator pattern: layers own-slice status
 *     on top of a base resolver without duck-typed casts.
 *
 * Acceptance:
 *   - `kind === 'slice'` + present in ownSlices → returns the slice's
 *     own status.
 *   - `kind === 'slice'` + absent in ownSlices → delegates to base.
 *   - `kind !== 'slice'` → delegates to base (no slice logic).
 *   - `resolveSubPlanFrontmatter` is forwarded unchanged.
 */

import { describe, expect, it } from 'vitest';

import type { IProposalFrontmatter } from '@mcp-vertex/proposals/lib/proposals/proposal-document';
import {
	buildInMemoryResolver,
	withOwnSlices,
} from '@mcp-vertex/proposals/lib/swarm/plan-closure';

describe('withOwnSlices — decorator', async () => {
	const baseFrontmatter: IProposalFrontmatter = {
		id: 'q99999',
		type: 'plan',
		status: 'in-progress',
		track: 'test',
	};
	const base = buildInMemoryResolver({
		slices: new Map([
			['qs1', { status: 'done' }],
			['qs2', { status: 'pending' }],
		]),
		proposals: new Map([
			['f00050', { status: 'done', peerReviewed: true }],
			['q99999', { status: 'in-progress', frontmatter: baseFrontmatter }],
		]),
	});

	it('returns own-slice status when present', async () => {
		const decorated = withOwnSlices(
			base,
			new Map([
				['s1', 'done'],
				['s2', 'pending'],
			]),
		);
		expect(await decorated.resolveOne('s1', 'slice')).toEqual({
			ref: 's1',
			kind: 'slice',
			status: 'done',
			peerReviewed: true,
		});
	});

	it('falls back to the base resolver for slices not in ownSlices', async () => {
		const decorated = withOwnSlices(base, new Map([['s1', 'done']]));
		expect(await decorated.resolveOne('qs1', 'slice')).toEqual({
			ref: 'qs1',
			kind: 'slice',
			status: 'done',
			peerReviewed: true,
		});
	});

	it('does NOT apply own-slice logic to proposals', async () => {
		const decorated = withOwnSlices(
			base,
			new Map([['f00050', 'done']]), // even if id matches a proposal
		);
		expect(await decorated.resolveOne('f00050', 'proposal')).toEqual({
			ref: 'f00050',
			kind: 'proposal',
			status: 'done',
			peerReviewed: true,
		});
	});

	it('forwards resolveSubPlanFrontmatter unchanged', async () => {
		const decorated = withOwnSlices(base, new Map());
		const frontmatter = await decorated.resolveSubPlanFrontmatter('q99999');
		expect(frontmatter).toEqual(baseFrontmatter);
	});
});
