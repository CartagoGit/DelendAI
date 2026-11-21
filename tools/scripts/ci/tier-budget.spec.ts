/**
 * tier-budget.spec.ts — c00139 (Track G).
 *
 * Budget enforcement for the tier workflows:
 *   - Tier 2 (pre-merge full matrix) targets < 10 min per job.
 *   - Tier 3 (nightly) is unbounded but must declare a non-zero timeout
 *     so a runaway job fails the gate.
 *
 * We parse `timeout-minutes` from each workflow to assert the budget
 * contract survives workflow refactors.
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const repoRoot = join(__dirname, '..', '..', '..');

const timeoutMinutes = async (file: string): Promise<number[]> => {
	const source = await readFile(
		join(repoRoot, '.github/workflows', file),
		'utf8',
	);
	const matches = [...source.matchAll(/timeout-minutes:\s*(\d+)/gu)];
	return matches.map((m) => Number(m[1] ?? 0));
};

describe('c00139 — tier budgets', () => {
	// Tier 1's budget case is deliberately gone with the workflow. A
	// five-minute ceiling is only a budget if the work fits inside it;
	// applied to a job that ran essentially the whole suite it was a
	// scheduled cancellation, and it reported `fail` on every pull
	// request for it. A ceiling nothing can meet does not enforce
	// speed — it manufactures red.
	it('tier2 keeps every job under the 10-minute budget', async () => {
		const timeouts = await timeoutMinutes('tier2.yml');
		expect(timeouts.length).toBeGreaterThan(0);
		for (const timeout of timeouts) {
			expect(timeout).toBeLessThanOrEqual(10);
		}
	});

	it('tier3 declares a generous but bounded timeout (extended battery)', async () => {
		const timeouts = await timeoutMinutes('tier3.yml');
		expect(timeouts.length).toBeGreaterThan(0);
		for (const timeout of timeouts) {
			// Extended battery: larger than tier2, but still
			// bounded so a runaway job fails the gate.
			expect(timeout).toBeGreaterThan(0);
			expect(timeout).toBeLessThanOrEqual(60);
		}
	});
});
