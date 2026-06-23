import { describe, expect, it } from 'vitest';

import {
	PROPOSAL_FLAGS,
	PROPOSAL_KIND_BY_PREFIX,
	PROPOSAL_KINDS,
	PROPOSAL_PREFIX_BY_KIND,
	PROPOSAL_STATUS_TRANSITIONS,
	PROPOSAL_STATUSES,
	STATUS_TO_FOLDER,
} from '@mcp-vertex/proposals/lib/contracts/constants/proposal-glossary.constant';

describe('proposal-glossary.constant (S1, 6 invariants)', () => {
	it('every status has a label (info) and a folder', () => {
		const statuses = Object.keys(PROPOSAL_STATUSES);
		expect(statuses).toHaveLength(7);
		for (const status of statuses) {
			const info =
				PROPOSAL_STATUSES[status as keyof typeof PROPOSAL_STATUSES];
			expect(info.folder).toBeTruthy();
			expect(
				STATUS_TO_FOLDER[status as keyof typeof STATUS_TO_FOLDER],
			).toBe(info.folder);
		}
	});

	it('every transition target is a known status', () => {
		const known = new Set(Object.keys(PROPOSAL_STATUSES));
		for (const [from, targets] of Object.entries(
			PROPOSAL_STATUS_TRANSITIONS,
		)) {
			expect(known.has(from)).toBe(true);
			for (const to of targets) {
				expect(known.has(to)).toBe(true);
			}
		}
	});

	it('terminal statuses have at most `retired` as an outgoing edge', () => {
		for (const [status, info] of Object.entries(PROPOSAL_STATUSES)) {
			if (!info.terminal) continue;
			const targets =
				PROPOSAL_STATUS_TRANSITIONS[
					status as keyof typeof PROPOSAL_STATUS_TRANSITIONS
				];
			for (const to of targets) {
				expect(to).toBe('retired');
			}
		}
	});

	it('every kind has a single lowercase-letter prefix', () => {
		const kinds = Object.keys(PROPOSAL_KINDS);
		expect(kinds.length).toBeGreaterThanOrEqual(13);
		for (const kind of kinds) {
			const prefix =
				PROPOSAL_PREFIX_BY_KIND[
					kind as keyof typeof PROPOSAL_PREFIX_BY_KIND
				];
			expect(prefix).toMatch(/^[a-z]$/);
		}
	});

	it('prefixes are unique across all known kinds', () => {
		const prefixes = Object.values(PROPOSAL_PREFIX_BY_KIND);
		expect(new Set(prefixes).size).toBe(prefixes.length);
	});

	it('resume kind uses prefix n with no version bump', () => {
		expect(PROPOSAL_KINDS.resume).toEqual({
			prefix: 'n',
			glyph: '🧭',
			conventionalCommitType: '',
			bump: 'none',
		});
		expect(PROPOSAL_KIND_BY_PREFIX.n).toBe('resume');
		expect(PROPOSAL_PREFIX_BY_KIND.resume).toBe('n');
	});

	it('the legacy alias table is consistent (p and l both resolve to legacy, l is canonical)', () => {
		expect(PROPOSAL_KIND_BY_PREFIX.p).toBe('legacy');
		expect(PROPOSAL_KIND_BY_PREFIX.l).toBe('legacy');
		expect(PROPOSAL_PREFIX_BY_KIND.legacy).toBe('l');
		// No live (non-legacy) kind reuses the retired `p` prefix.
		for (const [kind, info] of Object.entries(PROPOSAL_KINDS)) {
			if (kind === 'legacy') continue;
			expect(info.prefix).not.toBe('p');
		}
	});

	it('PROPOSAL_FLAGS documents the 3 frontmatter modifiers', () => {
		expect(Object.keys(PROPOSAL_FLAGS).sort()).toEqual([
			'cancelled',
			'deferred',
			'triaged',
		]);
	});
});
