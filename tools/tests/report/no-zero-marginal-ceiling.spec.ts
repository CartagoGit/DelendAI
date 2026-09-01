import { describe, expect, it } from 'vitest';

import { buildTokenBudgetDashboardMarkdown } from '../../scripts/report/token-budget-dashboard.script';

/**
 * AUD-B02/x00283 regression guard. The dashboard used to render
 * `marginalPluginHard ?? 0`, which printed the literal string `(0B)` in
 * the "Marginal Status" column for every governed preset missing a real
 * marginal ceiling — a permanent false "over hard" alarm no gate shared.
 * `IGovernedToolsListBudget` now makes both marginal fields required for
 * every governed preset, so the compiler should already prevent this,
 * but this guard also asserts the GENERATED artefact itself never
 * regresses to that string — belt and suspenders on the exact bug the
 * audit found in the committed markdown, not just the type.
 */
describe('token budget dashboard — no zero marginal ceiling', () => {
	it('never renders the (0B) false-alarm string', async () => {
		const markdown = await buildTokenBudgetDashboardMarkdown();
		expect(markdown).not.toContain('(0B)');
	}, 60_000);
});
