import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { repoRoot } from '../lib/repo-root';

/**
 * The slow-spec issue follows the offenders it reports.
 *
 * The integration run wrote an empty offenders file once no spec was over
 * its budget, and the step refreshed the open issue with that empty list:
 * issue #1815 stayed open with nothing in it. The step now closes it.
 */
describe('the slow-spec issue step', () => {
	const lines = readFileSync(
		`${repoRoot()}/.github/workflows/ci.yml`,
		'utf8',
	).split('\n');
	const NAME = '- name: Open, refresh or close the slow-spec issue';
	const at = lines.findIndex((line) => line.trim() === NAME);
	const end = lines.findIndex(
		(line, index) => index > at && line.trim().startsWith('- name: '),
	);
	const script = lines.slice(at, end < 0 ? undefined : end).join('\n');

	it('[<20ms] closes the open issue when no offender is left, before opening anything', () => {
		expect(at).toBeGreaterThan(-1);
		const empty = script.indexOf(
			'if [ ! -s .cache/spec-timings/offenders.md ]',
		);
		const close = script.indexOf('gh issue close "$number"');
		const create = script.indexOf('gh issue create');
		expect(empty).toBeGreaterThan(-1);
		expect(close).toBeGreaterThan(empty);
		expect(create).toBeGreaterThan(close);
		// Closing says why, so the history reads without the run at hand.
		expect(script).toMatch(
			/--comment "No spec is over its budget any more/u,
		);
	});

	it('[<20ms] still refreshes an open issue, and opens one, while offenders remain', () => {
		expect(script).toContain('gh issue edit "$number" --body "$body"');
		expect(script).toContain(
			'gh issue create --title "$title" --body "$body"',
		);
	});
});
