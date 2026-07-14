import { describe, expect, it } from 'vitest';

import {
	PROPOSAL_KINDS,
	PROPOSAL_PREFIX_BY_KIND,
} from '../../../../../src/lib/contracts/constants/proposal-glossary.constant';
import {
	kindMatchesId,
	newProposalIdSchema,
	PROPOSAL_KIND_VALUES,
	proposalIdSchema,
	proposalKindSchema,
} from '../../../../../src/lib/contracts/schemas/proposal-kind.schema';

describe('proposalKindSchema (f00114 S1)', () => {
	it('is DERIVED from PROPOSAL_KINDS — never a duplicated list', () => {
		expect([...PROPOSAL_KIND_VALUES].sort()).toEqual(
			Object.keys(PROPOSAL_KINDS).sort(),
		);
	});

	it('accepts every canonical kind', () => {
		for (const kind of Object.keys(PROPOSAL_KINDS)) {
			expect(proposalKindSchema.safeParse(kind).success).toBe(true);
		}
	});

	it('rejects unknown kinds', () => {
		for (const bad of ['yolo', 'feature', 'FEAT', '', 'p']) {
			expect(proposalKindSchema.safeParse(bad).success).toBe(false);
		}
	});
});

describe('proposalIdSchema (read seam — tolerant of historical forms)', () => {
	it('accepts canonical ids for every kind prefix', () => {
		for (const prefix of Object.values(PROPOSAL_PREFIX_BY_KIND)) {
			expect(proposalIdSchema.safeParse(`${prefix}00001`).success).toBe(
				true,
			);
		}
	});

	it('accepts the retired legacy alias prefix `p` (read-only)', () => {
		expect(proposalIdSchema.safeParse('p00003').success).toBe(true);
	});

	it('accepts the historical residual-letter suffix (f00067a)', () => {
		expect(proposalIdSchema.safeParse('f00067a').success).toBe(true);
	});

	it('accepts the short pre-f00016 legacy numbers (l99, l100)', () => {
		expect(proposalIdSchema.safeParse('l99').success).toBe(true);
		expect(proposalIdSchema.safeParse('l100').success).toBe(true);
	});

	it('rejects unknown prefixes and malformed ids', () => {
		for (const bad of [
			'z00001', // letter, but not a known kind prefix
			'F00001', // uppercase prefix
			'f00001-x', // trailing junk
			'00001', // no prefix
			'',
		]) {
			expect(proposalIdSchema.safeParse(bad).success).toBe(false);
		}
	});
});

describe('newProposalIdSchema (write seam — strict)', () => {
	it('accepts exactly <prefix><5 digits>', () => {
		expect(newProposalIdSchema.safeParse('f00113').success).toBe(true);
	});

	it('rejects the historical residual suffix and short numbers for NEW ids', () => {
		expect(newProposalIdSchema.safeParse('f00067a').success).toBe(false);
		expect(newProposalIdSchema.safeParse('f0001').success).toBe(false);
		expect(newProposalIdSchema.safeParse('l99').success).toBe(false);
	});

	it('rejects the retired legacy alias `p` for NEW ids', () => {
		expect(newProposalIdSchema.safeParse('p00099').success).toBe(false);
	});
});

describe('kindMatchesId', () => {
	it('accepts a coherent kind/id pair for every kind', () => {
		for (const [kind, prefix] of Object.entries(PROPOSAL_PREFIX_BY_KIND)) {
			expect(kindMatchesId(kind, `${prefix}00042`)).toEqual({ ok: true });
		}
	});

	it('accepts legacy through BOTH its canonical `l` and alias `p` prefixes', () => {
		expect(kindMatchesId('legacy', 'l00001')).toEqual({ ok: true });
		expect(kindMatchesId('legacy', 'p00003')).toEqual({ ok: true });
	});

	it('reports a structured mismatch reason', () => {
		const result = kindMatchesId('feat', 'x00001');
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.reason).toContain('x');
			expect(result.reason).toContain('feat');
		}
	});

	it('rejects unknown kinds and invalid ids with distinct reasons', () => {
		const badKind = kindMatchesId('yolo', 'f00001');
		expect(badKind.ok).toBe(false);
		if (!badKind.ok) expect(badKind.reason).toContain('yolo');

		const badId = kindMatchesId('feat', 'zzz');
		expect(badId.ok).toBe(false);
		if (!badId.ok) expect(badId.reason).toContain('zzz');
	});
});
