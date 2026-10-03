import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { repoRoot } from '../../scripts/lib/monorepo-paths';

/**
 * AUD-B02/x00283 regression guard. The dashboard used to render
 * `marginalPluginHard ?? 0`, which printed the literal string `(0B)` in
 * the "Marginal Status" column for every governed preset missing a real
 * marginal ceiling — a permanent false "over hard" alarm no gate shared.
 *
 * This asserts the COMMITTED artefact, not a freshly built one. The
 * property is held by a chain, and every link is enforced elsewhere in
 * the same `validate` run:
 *
 *   1. `IGovernedToolsListBudget` makes both marginal fields required,
 *      so the compiler stops a governed preset shipping without them.
 *   2. `presetMarginalBudget` returns `undefined` — rendering `n/a` —
 *      rather than falling back to zero, which is x00283's actual fix.
 *   3. `tokens:dashboard:check` regenerates the dashboard and fails on
 *      any drift from the committed file, so "committed" and "freshly
 *      generated" are the same document.
 *   4. This guard reads the document the audit actually found the bug
 *      in.
 *
 * It used to call `buildTokenBudgetDashboardMarkdown()` itself, which
 * boots every governed preset and measures it: 45s on an idle machine
 * against a hand-written 60s timeout that also OVERRODE the tools
 * project's deliberate 120s. Under the full suite it timed out — a
 * 45-second rebuild of a document step 3 has already rebuilt, to read
 * one string out of it.
 */
describe('token budget dashboard — no zero marginal ceiling', () => {
	it('never renders the (0B) false-alarm string', async () => {
		const markdown = await readFile(
			join(repoRoot(), 'docs/delendai/TOKEN-BUDGETS.md'),
			'utf8',
		);

		// Name the offending rows. A bare `not.toContain` says only that
		// the string is somewhere in a 300-line document, which is not
		// enough to tell which preset regressed.
		const offending = markdown
			.split('\n')
			.filter((line) => line.includes('(0B)'));

		expect(offending.join('\n')).toBe('');
	});
});
