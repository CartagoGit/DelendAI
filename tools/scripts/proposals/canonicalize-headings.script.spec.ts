#!/usr/bin/env bun
/**
 * canonicalize-headings.spec.ts — pins the contract of the
 * `canonicalize-headings.script.ts` engine + a drift guard against the
 * `proposal-scaffold-linter` it complements.
 *
 * SOLID: the script's pure functions (normalizeHeading, planFixes,
 * applyFixes) are exercised in isolation here. The drift guard is a
 * separate `describe` block — single responsibility per block.
 */
import { describe, expect, it } from 'vitest';

import { lintProposalMarkdown } from '../../../plugins/proposals/src/lib/proposals/proposal-scaffold-linter';

import {
	applyFixes,
	loadCanonicalHeadings,
	normalizeHeading,
	planFixes,
} from './canonicalize-headings.script.ts';

const PROPOSAL_CANONICAL = [
	'goal',
	'why',
	'why this design',
	'non-goals',
	'architecture',
	'slices',
	'dependency graph',
	'acceptance',
	'risks and mitigations',
	'notes',
] as const;

describe('normalizeHeading', () => {
	it('returns null when the heading is already canonical (exact match)', () => {
		expect(normalizeHeading('goal', PROPOSAL_CANONICAL)).toBeNull();
		expect(normalizeHeading('non-goals', PROPOSAL_CANONICAL)).toBeNull();
	});

	it('returns null for case-only differences (canonical is case-insensitive)', () => {
		expect(normalizeHeading('Goal', PROPOSAL_CANONICAL)).toBeNull();
		expect(normalizeHeading('WHY', PROPOSAL_CANONICAL)).toBeNull();
	});

	it('rewrites parenthetical-suffixed headings to the canonical base', () => {
		expect(
			normalizeHeading('Acceptance (end-to-end)', PROPOSAL_CANONICAL),
		).toBe('acceptance');
		expect(normalizeHeading('slices - deferred', PROPOSAL_CANONICAL)).toBe(
			'slices',
		);
	});

	it('rewrites known synonyms via the SYNONYMS map', () => {
		expect(normalizeHeading('see also', PROPOSAL_CANONICAL)).toBe('notes');
		expect(normalizeHeading('Risks', PROPOSAL_CANONICAL)).toBe(
			'risks and mitigations',
		);
	});

	it('returns null for an empty heading (defensive)', () => {
		expect(normalizeHeading('', PROPOSAL_CANONICAL)).toBeNull();
		expect(normalizeHeading('   ', PROPOSAL_CANONICAL)).toBeNull();
	});

	it('returns null when no mapping exists (linter will reject too)', () => {
		expect(
			normalizeHeading('totally unknown heading', PROPOSAL_CANONICAL),
		).toBeNull();
	});
});

describe('planFixes', () => {
	it('returns an empty plan for fully-canonical markdown', () => {
		const md = '# Title\n\n## goal\n\nbody\n\n## acceptance\n\n- done\n';
		expect(planFixes(md, PROPOSAL_CANONICAL)).toEqual([]);
	});

	it('emits one fix per non-canonical H2 in line order', () => {
		// `## Goal` is case-insensitively canonical (already in PROPOSAL_CANONICAL),
		// so only `## Acceptance (e2e)` triggers a fix.
		const md = '## Goal\n\nbody\n\n## Acceptance (e2e)\n\nbody\n';
		const fixes = planFixes(md, PROPOSAL_CANONICAL);
		expect(fixes).toHaveLength(1);
		expect(fixes[0]?.line).toBe(5);
		expect(fixes[0]?.before).toBe('## Acceptance (e2e)');
		expect(fixes[0]?.after).toBe('## acceptance');
	});

	it('still rewrites Title-Case headings when the canonical form has a hyphen', () => {
		// "Risks" matches the SYNONYMS alias, not a case-insensitive exact match.
		const md = '## Risks\n\nbody\n';
		const fixes = planFixes(md, PROPOSAL_CANONICAL);
		expect(fixes).toHaveLength(1);
		expect(fixes[0]?.after).toBe('## risks and mitigations');
	});

	it('ignores headings inside fenced code blocks', () => {
		const md = [
			'## Acceptance (e2e)', // line 1 — needs fix
			'',
			'```',
			'## Goal', // line 4 — inside fence, skip
			'```',
			'',
			'## acceptance', // already canonical
		].join('\n');
		const fixes = planFixes(md, PROPOSAL_CANONICAL);
		expect(fixes).toHaveLength(1);
		expect(fixes[0]?.line).toBe(1);
	});
});

describe('applyFixes', () => {
	it('is idempotent: a second pass over the rewritten markdown is a no-op', () => {
		const md = '## Acceptance (e2e)\n\nbody\n';
		const canonical = PROPOSAL_CANONICAL;
		const first = applyFixes(md, planFixes(md, canonical));
		const second = applyFixes(first, planFixes(first, canonical));
		expect(second).toBe(first);
	});

	it('preserves line count and surrounding context', () => {
		const md = 'a\n\n## Acceptance (e2e)\n\nb\n';
		const rew = applyFixes(md, planFixes(md, PROPOSAL_CANONICAL));
		const lines = rew.split('\n');
		expect(lines[0]).toBe('a');
		expect(lines[1]).toBe('');
		expect(lines[2]).toBe('## acceptance');
		expect(lines[3]).toBe('');
		expect(lines[4]).toBe('b');
	});

	it('returns the input unchanged when there are no fixes', () => {
		const md = '## goal\n\nbody\n';
		expect(applyFixes(md, [])).toBe(md);
	});
});

describe('loadCanonicalHeadings', () => {
	it('returns the proposal list when auditMode is false', async () => {
		const set = await loadCanonicalHeadings(false);
		expect(set).toEqual([...PROPOSAL_CANONICAL]);
	});

	it('returns a different set when auditMode is true', async () => {
		const set = await loadCanonicalHeadings(true);
		expect(set).toContain('verified state');
		expect(set).toContain('findings');
		expect(set).toContain('scoreboard');
	});
});

/**
 * Drift guard — the canonical lists in this script must agree with the
 * lists the linter uses internally. We probe by calling the linter on a
 * fixture that exercises every canonical heading: if any heading is
 * NOT recognised, the linter returns an "unrecognized section heading"
 * error and this spec fails.
 */
describe('drift: script canonical lists agree with proposal-scaffold-linter', () => {
	const probe = (list: readonly string[], kind: 'feat' | 'audit'): void => {
		for (const heading of list) {
			const filename =
				kind === 'audit' ? 'a99999-probe.md' : 'f99999-probe.md';
			const fixture = `---\ntitle: probe\nid: 99999\nkind: ${kind}\n---\n\n## goal\n\n## acceptance\n\n## ${heading}\n`;
			const result = lintProposalMarkdown({
				path: filename,
				markdown: fixture,
			});
			const hasUnrecognised = result.issues.some(
				(i) =>
					i.message.includes('unrecognized section heading') &&
					i.message.includes(`## ${heading}`),
			);
			expect(
				hasUnrecognised,
				`drift: heading "${heading}" is in the script's canonical list but the linter does not recognise it`,
			).toBe(false);
		}
	};

	it('every proposal-mode canonical heading is recognised by the linter', async () => {
		const set = await loadCanonicalHeadings(false);
		probe(set, 'feat');
	});

	it('every audit-mode canonical heading is recognised by the linter', async () => {
		const set = await loadCanonicalHeadings(true);
		probe(set, 'audit');
	});
});
