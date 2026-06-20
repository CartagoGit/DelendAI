/**
 * `check-tutorials-i18n` contract guard (p110 s3).
 *
 * The script exports `runCheck(langCodes, tutorials)` as a pure
 * function: same inputs, same parity verdict. This spec pins the
 * contract so future refactors (e.g. switching from fs reads to
 * a snapshot, or splitting the script into stages) cannot silently
 * regress the parity rule.
 *
 * What we test:
 * 1. A plugin with N EN tutorials and N tutorials in every language
 *    passes with `parityProblems = []`.
 * 2. A plugin missing a tutorial in any non-EN language fails with
 *    a `[plugin]` problem that names the missing language.
 * 3. An orphan slug (present in a non-EN language but absent in EN)
 *    is reported as `[plugin:lang]`.
 * 4. `needsHumanReview` counts tutorials that still carry
 *    `autoTranslated: true` or `needsHumanReview: true`.
 */
import { describe, expect, it } from 'vitest';

import { runCheck } from '../check-tutorials-i18n';
import type { ITutorial } from '../lib/discover-tutorials';
import type { Lang } from '../../src/i18n/shared';

const LANG_CODES = ['en', 'es', 'fr'] as const;

const mkTutorial = (lang: string, plugin: string, slug: string): ITutorial => ({
	plugin,
	lang: lang as Lang,
	slug,
	title: `Title for ${slug}`,
	body: `# body for ${slug}`,
});

describe('check-tutorials-i18n parity', () => {
	it('passes when every non-EN language has the same slugs as EN', () => {
		const tutorials: ITutorial[] = [
			mkTutorial('en', 'proposals', 'getting-started'),
			mkTutorial('es', 'proposals', 'getting-started'),
			mkTutorial('fr', 'proposals', 'getting-started'),
		];
		const out = runCheck(LANG_CODES, tutorials);
		expect(out.parityProblems).toEqual([]);
		expect(out.pendingReview).toBe(0);
		expect(out.totalFiles).toBe(3);
	});

	it('flags a missing translation in a non-EN language', () => {
		const tutorials: ITutorial[] = [
			mkTutorial('en', 'proposals', 'getting-started'),
			// `es` and `fr` are missing for `proposals/getting-started`.
			mkTutorial('es', 'memory', 'persisting'),
			mkTutorial('fr', 'memory', 'persisting'),
		];
		const out = runCheck(LANG_CODES, tutorials);
		expect(out.parityProblems).toContain(
			'[proposals] EN=1 · missing in: es, fr',
		);
	});

	it('flags an orphan slug (present in a non-EN language but absent in EN)', () => {
		const tutorials: ITutorial[] = [
			mkTutorial('en', 'docs', 'main-tutorial'),
			// `orphan` exists in es but never existed in en.
			mkTutorial('es', 'docs', 'main-tutorial'),
			mkTutorial('es', 'docs', 'orphan'),
		];
		const out = runCheck(LANG_CODES, tutorials);
		expect(
			out.parityProblems.some((p) =>
				p.includes('orphan slugs not in EN'),
			),
		).toBe(true);
	});

	it('counts tutorials that still need human review', () => {
		const tutorials: ITutorial[] = [
			{ ...mkTutorial('en', 'p', 'a'), autoTranslated: true },
			{
				...mkTutorial('es', 'p', 'a'),
				autoTranslated: true,
				needsHumanReview: true,
			},
			{ ...mkTutorial('fr', 'p', 'a') }, // already reviewed
		];
		const out = runCheck(LANG_CODES, tutorials);
		expect(out.pendingReview).toBe(2);
		expect(out.totalFiles).toBe(3);
	});

	it('reports each plugin independently', () => {
		const tutorials: ITutorial[] = [
			// proposals: 1 EN, complete.
			mkTutorial('en', 'proposals', 'p1'),
			mkTutorial('es', 'proposals', 'p1'),
			mkTutorial('fr', 'proposals', 'p1'),
			// memory: 2 EN, missing `m2` everywhere.
			mkTutorial('en', 'memory', 'm1'),
			mkTutorial('en', 'memory', 'm2'),
			mkTutorial('es', 'memory', 'm1'),
			mkTutorial('fr', 'memory', 'm1'),
		];
		const out = runCheck(LANG_CODES, tutorials);
		expect(out.parityProblems).toContain(
			'[memory] EN=2 · missing in: es, fr',
		);
		// totalFiles counts every tutorial in the catalogue — EN included,
		// because the EN files are also tracked (they show up as
		// "reviewed" in the dashboard). 3 (proposals) + 4 (memory) = 7.
		expect(out.totalFiles).toBe(7);
	});
});
