/**
 * a00072 S3.b — `quality:gate` CLI shim unit tests.
 *
 * The gate is a thin wrapper around the plugin's `resolveScopes` +
 * `runScope` + `createCommandRunner` helpers. We test the three
 * branches that map to the three exit codes:
 *   - every scope OK → exit 0
 *   - one scope failed → exit 1
 *   - no scopes configured → exit 2
 *
 * The shim is invoked via `bun test` so we exercise the same binary
 * path the `validate` script uses.
 */

import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const HERE = new URL('.', import.meta.url).pathname;
const SCRIPT = join(HERE, 'quality-gate.script.ts');

describe('quality:gate script (a00072 S3.b)', () => {
	let root = '';

	beforeEach(() => {
		root = mkdtempSync(join(tmpdir(), 'qgate-'));
	});
	afterEach(() => rmSync(root, { recursive: true, force: true }));

	const run = (cwd: string) =>
		spawnSync('bun', [SCRIPT], {
			cwd,
			encoding: 'utf8',
			timeout: 30_000,
		});

	const runWith = (
		cwd: string,
		args: readonly string[],
		env?: Record<string, string>,
	) =>
		spawnSync('bun', [SCRIPT, ...args], {
			cwd,
			encoding: 'utf8',
			timeout: 30_000,
			env: env !== undefined ? { ...process.env, ...env } : process.env,
		});

	it('exits 0 when every scope is clean', () => {
		writeFileSync(
			join(root, 'delendai.config.json'),
			JSON.stringify({
				plugins: {
					quality: {
						options: {
							scopes: { smoke: ['echo clean'] },
						},
					},
				},
			}),
		);
		const r = run(root);
		expect(r.status).toBe(0);
		expect(r.stdout).toMatch(/quality:gate: passed/);
	});

	it('exits 1 when a scope fails', () => {
		writeFileSync(
			join(root, 'delendai.config.json'),
			JSON.stringify({
				plugins: {
					quality: {
						options: {
							scopes: { smoke: ['false'] },
						},
					},
				},
			}),
		);
		const r = run(root);
		expect(r.status).toBe(1);
		expect(r.stderr).toMatch(/quality:gate: FAILED/);
	});

	it('exits 2 when no scopes are configured', () => {
		// No config file at all — the gate cannot make a decision.
		const r = run(root);
		expect(r.status).toBe(2);
		expect(r.stderr).toMatch(/failing closed/);
	});

	it('exits 2 when config is malformed', () => {
		writeFileSync(join(root, 'delendai.config.json'), '{ this is not json');
		const r = run(root);
		expect(r.status).toBe(2);
	});

	// x00186 (F28): the gate used to read `delendai.config.json` from
	// `process.cwd()` unconditionally — no `--workspace` support at all.
	it('honors --workspace instead of process.cwd()', () => {
		writeFileSync(
			join(root, 'delendai.config.json'),
			JSON.stringify({
				plugins: {
					quality: { options: { scopes: { smoke: ['echo clean'] } } },
				},
			}),
		);
		const elsewhere = mkdtempSync(join(tmpdir(), 'qgate-elsewhere-'));
		try {
			const r = runWith(elsewhere, ['--workspace', root]);
			expect(r.status).toBe(0);
			expect(r.stdout).toMatch(/quality:gate: passed/);
		} finally {
			rmSync(elsewhere, { recursive: true, force: true });
		}
	});

	it('honors DELENDAI_WORKSPACE when no --workspace flag is given', () => {
		writeFileSync(
			join(root, 'delendai.config.json'),
			JSON.stringify({
				plugins: {
					quality: { options: { scopes: { smoke: ['echo clean'] } } },
				},
			}),
		);
		const elsewhere = mkdtempSync(join(tmpdir(), 'qgate-elsewhere-'));
		try {
			const r = runWith(elsewhere, [], { DELENDAI_WORKSPACE: root });
			expect(r.status).toBe(0);
			expect(r.stdout).toMatch(/quality:gate: passed/);
		} finally {
			rmSync(elsewhere, { recursive: true, force: true });
		}
	});

	it('warns to stderr only when falling back to cwd, not when --workspace is explicit', () => {
		writeFileSync(
			join(root, 'delendai.config.json'),
			JSON.stringify({
				plugins: {
					quality: { options: { scopes: { smoke: ['echo clean'] } } },
				},
			}),
		);
		const implicit = run(root);
		expect(implicit.stderr).toMatch(/using cwd as workspace/);

		const elsewhere = mkdtempSync(join(tmpdir(), 'qgate-elsewhere-'));
		try {
			const explicit = runWith(elsewhere, ['--workspace', root]);
			expect(explicit.stderr).not.toMatch(/using cwd as workspace/);
		} finally {
			rmSync(elsewhere, { recursive: true, force: true });
		}
	});
});
