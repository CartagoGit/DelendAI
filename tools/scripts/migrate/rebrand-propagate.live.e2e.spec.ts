// rebrand-propagate.live.e2e.spec.ts — the rebrand scan over the real repository.
//
// It spawns bun and walks the whole tree, so it is an e2e: the fixture
// behaviour of the script stays in rebrand-propagate.spec.ts under 5000 ms.

import { spawnSync } from 'node:child_process';
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	rmSync,
	writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const HERE = resolve(fileURLToPath(import.meta.url), '..');
const ROOT = resolve(HERE, '..', '..', '..');
const SCRIPT = resolve(
	ROOT,
	'tools/scripts/migrate/rebrand-propagate.script.ts',
);

const run = (
	args: readonly string[],
	cwd: string,
): {
	readonly status: number;
	readonly stdout: string;
	readonly stderr: string;
} => {
	const result = spawnSync('bun', ['run', SCRIPT, ...args], {
		cwd,
		encoding: 'utf8',
		env: process.env,
	});
	return {
		status: result.status ?? -1,
		stdout: result.stdout ?? '',
		stderr: result.stderr ?? '',
	};
};

// When the test runs against a custom root (fixture), the script needs
// to know it. The convention is `--root=<path>`; SCAN_ROOT defaults to
// the monorepo when the flag is absent so the live-check test stays
// zero-config.
const runWithRoot = (
	args: readonly string[],
	cwd: string,
	root: string,
): ReturnType<typeof run> => run([...args, `--root=${root}`], cwd);

const makeFakeProject = (): string => {
	const dir = mkdtempSync(join(tmpdir(), 'rebrand-spec-'));
	mkdirSync(join(dir, 'src'), { recursive: true });
	mkdirSync(join(dir, 'dist'), { recursive: true });
	writeFileSync(
		join(dir, 'src/index.ts'),
		'export const brand = "oldbrand";\n',
	);
	writeFileSync(
		join(dir, 'dist/index.js'),
		'export const brand = "oldbrand";\n',
	);
	return dir;
};

describe('rebrand-propagate on the real repository', () => {
	it('[<5000ms] check-only flags stale source references without counting generated dist output', () => {
		const fixture = makeFakeProject();
		try {
			const result = runWithRoot(
				['--check', '--from=oldbrand', '--to=newbrand'],
				fixture,
				fixture,
			);
			expect(result.status).toBe(1);
			expect(result.stdout).toContain('still appears in 1 live file(s)');
			expect(result.stdout).toMatch(/src\/index\.ts/);
			expect(result.stdout).not.toMatch(/dist\/index\.js/);
		} finally {
			rmSync(fixture, { recursive: true, force: true });
		}
	});

	it('[<5000ms] passes after the source is migrated', () => {
		const fixture = makeFakeProject();
		try {
			writeFileSync(
				join(fixture, 'src/index.ts'),
				'export const brand = "newbrand";\n',
			);
			writeFileSync(
				join(fixture, 'dist/index.js'),
				'export const brand = "newbrand";\n',
			);
			const result = runWithRoot(
				['--check', '--from=oldbrand', '--to=newbrand'],
				fixture,
				fixture,
			);
			expect(result.status).toBe(0);
			expect(result.stdout).toContain('Rebrand propagation clean');
		} finally {
			rmSync(fixture, { recursive: true, force: true });
		}
	});

	it('[<5000ms] honours --help and exits 0 without scanning', () => {
		const result = run(['--help'], ROOT);
		expect(result.status).toBe(0);
		expect(result.stdout).toMatch(/Usage:/);
	});

	it('[<5000ms] does not flag preserved historical sinks (CHANGELOG.md)', () => {
		const fixture = makeFakeProject();
		try {
			writeFileSync(
				join(fixture, 'CHANGELOG.md'),
				'# oldbrand release notes\n',
			);
			const result = runWithRoot(
				['--check', '--from=oldbrand', '--to=newbrand'],
				fixture,
				fixture,
			);
			// The CHANGELOG.md entry should NOT be in the hits.
			expect(result.stdout).not.toMatch(/CHANGELOG\.md/);
		} finally {
			rmSync(fixture, { recursive: true, force: true });
		}
	});

	it('[<5000ms] ignores the intentional legacy compatibility corpus only in the pinned paths', () => {
		const fixture = mkdtempSync(join(tmpdir(), 'rebrand-compat-'));
		try {
			mkdirSync(
				join(fixture, 'packages/core/src/lib/workspace-migration'),
				{ recursive: true },
			);
			mkdirSync(join(fixture, 'packages/app/src'), { recursive: true });
			writeFileSync(
				join(
					fixture,
					'packages/core/src/lib/workspace-migration/catalog.ts',
				),
				'export const legacy = "oldbrand";\n',
			);
			writeFileSync(
				join(fixture, 'packages/app/src/index.ts'),
				'export const leaked = "oldbrand";\n',
			);

			const result = runWithRoot(
				['--check', '--from=oldbrand', '--to=newbrand'],
				fixture,
				fixture,
			);
			expect(result.status).toBe(1);
			expect(result.stdout).toMatch(/packages\/app\/src\/index\.ts/);
			expect(result.stdout).not.toMatch(
				/packages\/core\/src\/lib\/workspace-migration\/catalog\.ts/,
			);
		} finally {
			rmSync(fixture, { recursive: true, force: true });
		}
	});

	it('[<5000ms] fails when the residual scanner still finds a repo-owned legacy hit', () => {
		const fixture = makeFakeProject();
		try {
			mkdirSync(join(fixture, 'packages/app/src'), { recursive: true });
			writeFileSync(
				join(fixture, 'src/index.ts'),
				'export const brand = "newbrand";\n',
			);
			writeFileSync(
				join(fixture, 'dist/index.js'),
				'export const brand = "newbrand";\n',
			);
			writeFileSync(
				join(fixture, 'packages/app/src/cli.ts'),
				'export const completion = "_" + "mcpv_complete";\n',
			);

			const result = runWithRoot(
				['--check', '--from=oldbrand', '--to=newbrand'],
				fixture,
				fixture,
			);
			expect(result.status).toBe(1);
			expect(result.stdout).toContain('Legacy identity scanner:');
			expect(result.stdout).toContain('packages/app/src/cli.ts:1');
			expect(result.stderr).toContain(
				'Legacy identity scanner INCOMPLETE',
			);
		} finally {
			rmSync(fixture, { recursive: true, force: true });
		}
	});

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
