import { describe, expect, it } from 'vitest';

import {
	buildKindOrder,
	DEFAULT_KIND_ORDER,
	FrontmatterOverrideResolver,
	KindCascadePriorityResolver,
	LEGACY_ALIAS_PREFIX,
} from '../../../../src/lib/cascade/cascade-priority';
import type { IProposalSummary } from '../../../../src/lib/cascade/cascade-priority';
import {
	buildDefaultCascadeChain,
	sortByCascade,
} from '../../../../src/lib/cascade/cascade-chain';
import type { IProposalKind } from '../../../../src/lib/contracts/constants/proposal-glossary.constant';

const summary = (
	overrides: Partial<IProposalSummary> & {
		id: string;
		kind: IProposalSummary['kind'];
	},
): IProposalSummary => overrides;

describe('buildKindOrder', async () => {
	it('ranks every active kind by its index in the order list', async () => {
		const order = buildKindOrder();
		DEFAULT_KIND_ORDER.forEach((kind, index) => {
			expect(order.get(kind)).toBe(index);
		});
	});

	it('places the legacy `p` alias one rank behind `legacy`', async () => {
		const order = buildKindOrder();
		const legacyRank = order.get('legacy');
		expect(legacyRank).toBeDefined();
		expect(order.get(LEGACY_ALIAS_PREFIX)).toBe((legacyRank as number) + 1);
	});

	it('accepts a synthetic kind order for testability', async () => {
		const order = buildKindOrder(['docs', 'feat'] as IProposalKind[]);
		expect(order.get('docs')).toBe(0);
		expect(order.get('feat')).toBe(1);
	});
});

describe('KindCascadePriorityResolver', async () => {
	const resolver = new KindCascadePriorityResolver(buildKindOrder());

	it('resolves each active kind to its rank', async () => {
		expect(resolver.resolve(summary({ id: 'x1', kind: 'fix' }))).toBe(0);
		expect(resolver.resolve(summary({ id: 'f1', kind: 'feat' }))).toBe(4);
		expect(resolver.resolve(summary({ id: 'a1', kind: 'audit' }))).toBe(2);
	});

	it('returns +Infinity for an unknown kind instead of throwing', async () => {
		const unknown = summary({
			id: 'z1',
			kind: 'not-a-real-kind' as unknown as IProposalSummary['kind'],
		});
		expect(resolver.resolve(unknown)).toBe(Number.POSITIVE_INFINITY);
	});

	it('applies a boost penalty without crossing into another kind', async () => {
		const boosted = resolver.resolve(
			summary({
				id: 'f1',
				kind: 'feat',
				cascadeBoost: 'shipped-blocking',
			}),
		);
		// rank(feat) = 4, penalty 0.5 -> 3.5: still behind any fix (rank 0).
		expect(boosted).toBe(3.5);
		expect(boosted).toBeGreaterThan(
			resolver.resolve(summary({ id: 'x1', kind: 'fix' })),
		);
	});
});

describe('FrontmatterOverrideResolver', async () => {
	const chain = new FrontmatterOverrideResolver(
		new KindCascadePriorityResolver(buildKindOrder()),
	);

	it('lets cascadeOverride win over the kind rank, even a negative one', async () => {
		const overridden = summary({
			id: 'f00004',
			kind: 'feat',
			cascadeOverride: -1,
			cascadeOverrideReason: 'urgent customer escalation',
		});
		const plainFix = summary({ id: 'x1', kind: 'fix' });
		expect(chain.resolve(overridden)).toBeLessThan(chain.resolve(plainFix));
	});

	it('lets a high cascadeOverride lose against an unmodified rank-0 kind', async () => {
		const overridden = summary({
			id: 'x2',
			kind: 'fix',
			cascadeOverride: 99,
			cascadeOverrideReason: 'deliberately deprioritized',
		});
		const plainFix = summary({ id: 'x1', kind: 'fix' });
		expect(chain.resolve(overridden)).toBeGreaterThan(
			chain.resolve(plainFix),
		);
	});

	it('falls through to the inner resolver when no override is set', async () => {
		const plain = summary({ id: 'a1', kind: 'audit' });
		expect(chain.resolve(plain)).toBe(2);
	});

	it('throws an explicit error when cascadeOverride lacks a reason', async () => {
		const unexplained = summary({
			id: 'f1',
			kind: 'feat',
			cascadeOverride: -1,
		});
		expect(() => chain.resolve(unexplained)).toThrow(
			/cascadeOverrideReason/,
		);
	});
});

describe('buildDefaultCascadeChain + sortByCascade', async () => {
	it('orders fixes before feats before docs, by default kind order', async () => {
		const proposals: IProposalSummary[] = [
			summary({ id: 'f1', kind: 'feat' }),
			summary({ id: 'd1', kind: 'docs' }),
			summary({ id: 'x1', kind: 'fix' }),
		];
		const sorted = sortByCascade(proposals, buildDefaultCascadeChain());
		expect(sorted.map((p) => p.id)).toEqual(['x1', 'f1', 'd1']);
	});

	it('keeps a feat with shipped-blocking boost behind a plain fix', async () => {
		const proposals: IProposalSummary[] = [
			summary({
				id: 'f1',
				kind: 'feat',
				cascadeBoost: 'shipped-blocking',
			}),
			summary({ id: 'x1', kind: 'fix' }),
		];
		const sorted = sortByCascade(proposals, buildDefaultCascadeChain());
		expect(sorted.map((p) => p.id)).toEqual(['x1', 'f1']);
	});

	it('lets a break-glass override place a feat ahead of a normal fix', async () => {
		const proposals: IProposalSummary[] = [
			summary({ id: 'x1', kind: 'fix' }),
			summary({
				id: 'f1',
				kind: 'feat',
				cascadeOverride: -5,
				cascadeOverrideReason:
					'critical security patch riding on a feat branch',
			}),
		];
		const sorted = sortByCascade(proposals, buildDefaultCascadeChain());
		expect(sorted.map((p) => p.id)).toEqual(['f1', 'x1']);
	});
});
