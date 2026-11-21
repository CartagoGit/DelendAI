// rebrand-propagate.live.e2e.spec.ts — the rebrand scan over the real repository.
//
// It spawns bun and walks the whole tree, so it is an e2e: the fixture
// behaviour of the script stays in rebrand-propagate.spec.ts under 5000 ms.

import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const HERE = resolve(fileURLToPath(import.meta.url), '..');
const ROOT = resolve(HERE, '..', '..', '..');
const SCRIPT = resolve(
	ROOT,
	'tools/scripts/migrate/rebrand-propagate.script.ts',
);

describe('rebrand-propagate on the real repository', () => {
	it('[<10000ms] passes on the real repo (live brand propagation is clean)', () => {
		if (!existsSync(SCRIPT)) {
			throw new Error(`rebrand-propagate.script.ts missing at ${SCRIPT}`);
		}
		const result = spawnSync('bun', ['run', SCRIPT, '--check'], {
			cwd: ROOT,
			encoding: 'utf8',
			env: process.env,
		});
		const stdout = result.stdout ?? '';
		expect(stdout).toContain('Rebrand propagation clean');
		expect(stdout).toContain(
			'0 repo-owned LIVE hit(s) after historical/fixture filters',
		);
		expect(stdout).toContain('Brand contract:');
		expect(stdout).toContain('brand contract green');
		expect(result.status).toBe(0);
	});
});
