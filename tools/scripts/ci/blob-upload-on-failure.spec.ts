import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { repoRoot } from '../lib/repo-root';

/**
 * The coverage a red shard measured still has to reach the merge.
 *
 * On 2026-11-05 one spec failed in the `tools 2/4` zone. The step that
 * uploads that zone's blob report was skipped, because a step without
 * `always()` does not run after the step before it failed. The merge then
 * judged the coverage of the whole run from the shards that happened to
 * pass, and `lint:no-dead-modules` reported
 * `tools/scripts/lib/monorepo-paths.ts` as a module whose 20 functions
 * had never run — while its own spec had run and passed in that very
 * shard. One red spec therefore produced two red jobs, and the red
 * integration branch stopped the queue from arming anything.
 */
describe('the coverage blob of a failed zone', () => {
	const workflow = readFileSync(
		`${repoRoot()}/.github/workflows/ci.yml`,
		'utf8',
	);

	it('is uploaded even when the zone failed', () => {
		const upload = workflow.match(
			/- name: Upload this zone's blob report\n(?:\s+.*\n)*?\s+if: ([^\n]+)\n/u,
		);
		expect(upload).not.toBeNull();
		expect(upload?.[1]).toContain('always()');
	});

	it('is uploaded only for a zone that ran', () => {
		const upload = workflow.match(
			/- name: Upload this zone's blob report\n(?:\s+.*\n)*?\s+if: ([^\n]+)\n/u,
		);
		expect(upload?.[1]).toContain('matrix.zone.run');
	});

	it('does not fail the upload when a zone produced no report at all', () => {
		// A zone that failed before writing its report has nothing to
		// upload; the merge already names the zone that is missing.
		expect(workflow).toContain('if-no-files-found: warn');
	});
});
