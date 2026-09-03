/**
 * preserve-rules.spec.ts — q00014 S6.
 *
 * The property under test is the one that makes automatic compaction
 * safe to run unattended: a summary that drops a constraint the user
 * set, a decision they made, an established cause, or an identifier
 * must FAIL the check. A compaction that loses those does not look
 * like a failure — it looks like a shorter context — so the test is
 * the only thing standing between "compacted" and "quietly forgot".
 */

import { describe, expect, it } from 'vitest';

import {
	extractLoadBearing,
	verifySummaryPreserves,
} from '../../../../src/lib/compaction/preserve-rules';

describe('extractLoadBearing', () => {
	it('marks a user constraint in either language', () => {
		const found = extractLoadBearing(
			[
				'The report must never contain source code.',
				'El informe nunca debe incluir código del proyecto.',
			].join('\n'),
		);
		expect(
			found.filter((f) => f.category === 'user-constraint'),
		).toHaveLength(2);
	});

	it('marks a settled decision', () => {
		const found = extractLoadBearing(
			'We decided to keep the shared checkout and skip worktrees.',
		);
		expect(found.some((f) => f.category === 'user-decision')).toBe(true);
	});

	it('marks an established cause but not a guess', () => {
		const found = extractLoadBearing(
			[
				'The loop happened because the engine held a second copy of the driver.',
				'It probably happens because of the poll interval.',
			].join('\n'),
		);
		const causes = found.filter((f) => f.category === 'diagnosed-cause');
		expect(causes).toHaveLength(1);
		expect(causes[0]?.text).toContain('second copy');
	});

	it('collects identifiers from any line, classified or not', () => {
		const found = extractLoadBearing(
			'See 29e2f2fea and x00423 in plugins/commit-policy/src/index.ts.',
		);
		const ids = found
			.filter((f) => f.category === 'identifier')
			.map((f) => f.text);
		expect(ids).toContain('29e2f2fea');
		expect(ids).toContain('x00423');
		expect(ids).toContain('plugins/commit-policy/src/index.ts');
	});

	it('does not report the same fragment twice', () => {
		const found = extractLoadBearing('x00423\nx00423\nx00423');
		expect(found.filter((f) => f.text === 'x00423')).toHaveLength(1);
	});
});

describe('verifySummaryPreserves', () => {
	const source = [
		'The user decided error-reporting stays on by default.',
		'Reports must never contain project source code.',
		'The storm happened because the event id was the whole event.',
		'Fixed in 17746f96d, tracked as x00423.',
	].join('\n');

	it('passes a summary that carries everything, reworded', () => {
		const verdict = verifySummaryPreserves({
			source,
			summary: [
				'Decision: error-reporting remains enabled by default.',
				'Constraint: reports must never carry project source code.',
				'Cause: the storm happened because the event id was the whole event.',
				'Landed in 17746f96d as x00423.',
			].join('\n'),
		});
		expect(verdict.dropped).toEqual([]);
		expect(verdict.ok).toBe(true);
	});

	it('fails a summary that drops the user constraint', () => {
		// The case that motivates the whole module: everything else is
		// carried, the summary reads perfectly well, and the boundary
		// the user set is simply gone.
		const verdict = verifySummaryPreserves({
			source,
			summary: [
				'Decision: error-reporting remains enabled by default.',
				'Cause: the storm happened because the event id was the whole event.',
				'Landed in 17746f96d as x00423.',
			].join('\n'),
		});
		expect(verdict.ok).toBe(false);
		expect(
			verdict.dropped.some((f) => f.category === 'user-constraint'),
		).toBe(true);
		expect(verdict.nextAction).toContain('Do NOT replace');
	});

	it('fails a summary that paraphrases an identifier away', () => {
		// A SHA is verbatim or it is lost.
		const verdict = verifySummaryPreserves({
			source: 'Fixed in 17746f96d.',
			summary: 'Fixed in a recent commit.',
		});
		expect(verdict.ok).toBe(false);
		expect(verdict.dropped[0]?.category).toBe('identifier');
	});

	it('says plainly when the summary is safe', () => {
		const verdict = verifySummaryPreserves({
			source: 'Nothing load-bearing here.',
			summary: 'Nothing.',
		});
		expect(verdict.ok).toBe(true);
		expect(verdict.nextAction).toContain('safe to use');
	});
});
