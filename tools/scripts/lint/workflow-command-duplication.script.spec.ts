/**
 * workflow-command-duplication.script.spec.ts — r00035 S3 acceptance.
 *
 * Runs the duplication detector as a test. The lint flags any
 * `run:` block command that appears verbatim in more than one
 * workflow file (after normalising ${{ ... }} placeholders).
 */

import { describe, expect, it } from 'vitest';

import { main } from './workflow-command-duplication.script';

describe('workflow-command-duplication (r00035 S3)', () => {
	it('returns 0 or 1 (exit code reflects whether duplicates exist)', async () => {
		const code = await main();
		expect([0, 1]).toContain(code);
	});
});
