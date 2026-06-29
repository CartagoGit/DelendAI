/**
 * proposal-narrative-patterns.spec.ts — r00003 S7 (F2, S + O + D).
 *
 * The host-specific narrative catalogue (Spanish audit phrasings, emoji
 * sections, `copilot · minimax-m3`, `mcp-vertex`, …) used to live inline
 * in `proposal-scaffold-linter.ts`. It now lives behind an injectable
 * `INarrativePatternProvider`. These specs pin:
 *
 *   - the default provider produces a PASSING linter on a00036 (the audit
 *     whose narrative headings would otherwise be flagged);
 *   - an EMPTY provider makes the linter structure-only (so a host can opt
 *     out of one project's vocabulary entirely);
 *   - a host can inject its OWN narrative tuples.
 */

import { describe, expect, it } from 'vitest';

import {
	createDefaultNarrativePatternProvider,
	createEmptyNarrativePatternProvider,
	createNarrativePatternProvider,
	HISTORICAL_AUDIT_NARRATIVE_ENTRIES,
} from '../../../../src/lib/proposals/proposal-narrative-patterns';
import { lintProposalMarkdown } from '../../../../src/lib/proposals/proposal-scaffold-linter';

/**
 * A proposal body whose section headings are all *narrative* aliases from
 * the historical catalogue (Spanish phrasings + emoji). With the default
 * provider these resolve to canonical sections and the body lints clean;
 * with an empty provider they are flagged as unrecognized. This is the
 * "host narrative" the F2 finding wanted out of the runtime linter.
 */
const narrativeProposal = [
	'---',
	'id: r99999',
	'status: ready',
	'type: proposal',
	'title: narrative-headings fixture',
	'---',
	'',
	'## decisión de fondo',
	'the goal (narrative alias → goal).',
	'',
	'## Why',
	'why this exists.',
	'',
	'## out of scope',
	'left out (narrative alias → non-goals).',
	'',
	'## Slices',
	'',
	'### S1 — do the thing',
	'- **Files**: `x.ts`',
	'- **Gate**: `bun run test`',
	'',
	'## acceptance criteria',
	'verified (narrative alias → acceptance).',
	'',
].join('\n');
const fixturePath =
	'docs/mcp-vertex/proposals/ready/r99999-narrative-headings-fixture.md';

describe('narrative pattern providers', async () => {
	it('default provider carries the historical audit catalogue', async () => {
		const provider = createDefaultNarrativePatternProvider();
		// A representative historical narrative heading resolves to `notes`.
		expect(provider.aliases.estado).toContain('notes');
		expect(Object.keys(provider.aliases).length).toBeGreaterThan(50);
	});

	it('empty provider has no aliases (structure-only linting)', async () => {
		const provider = createEmptyNarrativePatternProvider();
		expect(Object.keys(provider.aliases)).toHaveLength(0);
	});

	it('createNarrativePatternProvider builds from host tuples and ignores malformed rows', async () => {
		const provider = createNarrativePatternProvider([
			['mi sección', 'notes'],
			// malformed rows must not throw — they are dropped.
			['bad-row'] as unknown as readonly [string, string],
			[1, 2] as unknown as readonly [string, string],
		]);
		expect(provider.aliases['mi sección']).toEqual(['notes']);
		expect(provider.aliases['bad-row']).toBeUndefined();
	});

	it('undefined entries fall back to the historical default', async () => {
		const provider = createNarrativePatternProvider(undefined);
		expect(Object.keys(provider.aliases).length).toBe(
			Object.keys(createDefaultNarrativePatternProvider().aliases).length,
		);
	});
});

describe('lintProposalMarkdown narrative-pattern injection (F2)', async () => {
	it('the DEFAULT config lints a fully-narrative proposal body clean', async () => {
		// The historical aliases (default provider) resolve every narrative
		// heading to its canonical section, so a proposal written entirely
		// in the historical vocabulary lints with no "unrecognized section"
		// issues — zero per-file config required.
		const result = lintProposalMarkdown({
			path: fixturePath,
			markdown: narrativeProposal,
		});
		const unrecognized = result.issues.filter((i) =>
			/unrecognized section/.test(i.message),
		);
		expect(unrecognized).toEqual([]);
	});

	it('an EMPTY provider surfaces the same narrative headings as unrecognized', async () => {
		// Proof the aliases do real work: with NO narrative patterns the
		// linter is structure-only and the Spanish/emoji headings are no
		// longer recognized.
		const result = lintProposalMarkdown({
			path: fixturePath,
			markdown: narrativeProposal,
			narrativePatterns: createEmptyNarrativePatternProvider(),
		});
		expect(
			result.issues.some((i) => /unrecognized section/.test(i.message)),
		).toBe(true);
	});

	it('the historical catalogue is non-trivial (it really moved out of the linter)', async () => {
		expect(HISTORICAL_AUDIT_NARRATIVE_ENTRIES.length).toBeGreaterThan(100);
	});
});
