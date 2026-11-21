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

	/**
	 * The `if:` of the step named `name`, read line by line.
	 *
	 * A regex over the workflow would have to span the step's lines, and
	 * the shape that does it — a nested `(?:\s+.*\n)*` — is exactly the
	 * polynomial one CodeQL flags. The workflow is a list of lines; so is
	 * this.
	 */
	const conditionOf = (name: string): string | undefined => {
		const lines = workflow.split('\n');
		const at = lines.findIndex((line) => line.trim() === `- name: ${name}`);
		if (at < 0) return undefined;
		for (let index = at + 1; index < lines.length; index += 1) {
			const line = lines[index] ?? '';
			const trimmed = line.trim();
			if (trimmed.startsWith('- name:')) return undefined;
			if (trimmed.startsWith('if:')) {
				return trimmed.slice('if:'.length).trim();
			}
		}
		return undefined;
	};

	it('is uploaded even when the zone failed', () => {
		const condition = conditionOf("Upload this zone's blob report");
		expect(condition).toBeDefined();
		expect(condition).toContain('always()');
	});

	it('is uploaded only for a zone that ran', () => {
		const condition = conditionOf("Upload this zone's blob report");
		expect(condition).toContain('matrix.zone.run');
	});

	it('does not fail the upload when a zone produced no report at all', () => {
		// A zone that failed before writing its report has nothing to
		// upload; the merge already names the zone that is missing.
		expect(workflow).toContain('if-no-files-found: warn');
	});
});
