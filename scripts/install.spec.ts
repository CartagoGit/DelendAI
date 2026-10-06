/**
 * install.spec.ts — f00148 S2: verify the install.script.ts helper.
 *
 * Drives `main()` directly with a captured argv + env, so the tests
 * run without forking a child process. The `detectTarget` /
 * `parseArgs` / `writeDispatcher` exports are covered with focused
 * unit tests; the integration paths (help, --local, unknown args,
 * missing-binary fallback) are exercised via the `main()` entry.
 */
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
	detectTarget,
	main,
	parseArgs,
	writeDispatcher,
} from './install.script';

describe('parseArgs', () => {
	it('returns defaults when no args are provided', () => {
		const a = parseArgs([]);
		expect(a.help).toBe(false);
		expect(a.local).toBe(false);
		expect(a.version).toBe('latest');
	});

	it('parses --version <tag>', () => {
		const a = parseArgs(['--version', 'v0.1.0']);
		expect(a.version).toBe('v0.1.0');
	});

	it('parses --local', () => {
		expect(parseArgs(['--local']).local).toBe(true);
	});

	it('parses --help / -h', () => {
		expect(parseArgs(['--help']).help).toBe(true);
		expect(parseArgs(['-h']).help).toBe(true);
	});

	it('exits non-zero on unknown arg', () => {
		const exitSpy = vi.spyOn(process, 'exit').mockImplementation((code) => {
			throw new Error(`exit:${code}`);
		});
		try {
			expect(() => parseArgs(['--bogus'])).toThrow();
		} finally {
			exitSpy.mockRestore();
		}
	});
});

describe('detectTarget', () => {
	it('returns the running platform', () => {
		const t = detectTarget();
		if (process.platform === 'linux') {
			expect(t.os).toBe('linux');
		}
		if (process.platform === 'darwin') {
			expect(t.os).toBe('darwin');
		}
		expect(['amd64', 'arm64']).toContain(t.arch);
	});
});

describe('writeDispatcher', () => {
	it('writes an executable bun dispatcher to the target path', () => {
		const dir = mkdtempSync(join(tmpdir(), 'delendai-disp-'));
		try {
			const target = join(dir, 'delendai');
			writeDispatcher(target, '/tmp/fake-cli/index.ts');
			expect(existsSync(target)).toBe(true);
			const content = readFileSync(target, 'utf8');
			expect(content).toContain('exec bun');
			expect(content).toContain('/tmp/fake-cli/index.ts');
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});
});

describe('main()', () => {
	let dir: string;
	beforeEach(() => {
		dir = mkdtempSync(join(tmpdir(), 'delendai-install-'));
	});
	afterEach(() => {
		rmSync(dir, { recursive: true, force: true });
	});

	const run = async (
		args: readonly string[],
	): Promise<{ code: number; stdout: string; stderr: string }> => {
		const stdoutChunks: string[] = [];
		const stderrChunks: string[] = [];
		const stdoutSpy = vi
			.spyOn(process.stdout, 'write')
			.mockImplementation((chunk: string | Uint8Array) => {
				stdoutChunks.push(
					typeof chunk === 'string' ? chunk : chunk.toString(),
				);
				return true;
			});
		const stderrSpy = vi
			.spyOn(process.stderr, 'write')
			.mockImplementation((chunk: string | Uint8Array) => {
				stderrChunks.push(
					typeof chunk === 'string' ? chunk : chunk.toString(),
				);
				return true;
			});
		const exitSpy = vi.spyOn(process, 'exit').mockImplementation((code) => {
			throw new Error(`exit:${code}`);
		});
		const code = await main();
		stdoutSpy.mockRestore();
		stderrSpy.mockRestore();
		exitSpy.mockRestore();
		return {
			code,
			stdout: stdoutChunks.join(''),
			stderr: stderrChunks.join(''),
		};
	};

	it('--help exits 0 and prints usage', async () => {
		const { code, stdout } = await run(['--help']);
		expect(code).toBe(0);
		expect(stdout).toContain('install.script.ts');
		expect(stdout).toContain('--version');
	});

	it('--local writes a bun dispatcher', async () => {
		const { code, stderr } = await run(['--dir', dir, '--local']);
		expect(code).toBe(0);
		const target = join(dir, 'delendai');
		expect(existsSync(target)).toBe(true);
		expect(readFileSync(target, 'utf8')).toContain('exec bun');
		expect(stderr).toContain('local install');
	});

	it('rejects empty --dir', async () => {
		const { code, stderr } = await run(['--dir', '']);
		expect(code).not.toBe(0);
		expect(stderr).toContain('--dir cannot be empty');
	});
});

import { vi } from 'vitest';
