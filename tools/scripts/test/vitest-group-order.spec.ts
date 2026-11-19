import { spawnSync } from 'node:child_process';

import { describe, expect, it } from 'vitest';

import { repoRoot } from '../lib/repo-root';

describe('vitest group order', () => {
	it('accepts the core and proposals projects together', () => {
		// A filter that matches no file: vitest still resolves every project's
		// workers and group order, and refuses a clash before it looks for specs.
		const run = spawnSync(
			'bunx',
			[
				'vitest',
				'run',
				'--project',
				'core',
				'--project',
				'proposals',
				'--maxWorkers=2',
				'--passWithNoTests',
				'no-such-spec-file-anywhere',
			],
			{ cwd: repoRoot(), encoding: 'utf8', timeout: 100_000 },
		);
		expect(`${run.stdout}${run.stderr}`).not.toContain(
			"have different 'maxWorkers'",
		);
		expect(run.status).toBe(0);
	}, 120_000);
});
