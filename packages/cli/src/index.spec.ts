import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { runHumanCli } from './index';

describe('runHumanCli', async () => {
	it('prints the version', async () => {
		const writes: string[] = [];
		const original = process.stdout.write;
		process.stdout.write = ((chunk: string) => {
			writes.push(chunk);
			return true;
		}) as typeof process.stdout.write;
		try {
			await expect(
				runHumanCli(['--version'], process.cwd()),
			).resolves.toBe(0);
			expect(writes.join('')).toBe('0.1.0\n');
		} finally {
			process.stdout.write = original;
		}
	});

	it('prints help with important commands', async () => {
		const writes: string[] = [];
		const original = process.stdout.write;
		process.stdout.write = ((chunk: string) => {
			writes.push(chunk);
			return true;
		}) as typeof process.stdout.write;
		try {
			await expect(runHumanCli(['--help'], process.cwd())).resolves.toBe(
				0,
			);
			expect(writes.join('')).toContain('overview');
			expect(writes.join('')).toContain('plugin list');
			expect(writes.join('')).toContain('config doctor');
		} finally {
			process.stdout.write = original;
		}
	});

	it('prints localized help labels and falls back to English', async () => {
		const es = await captureStdout(() =>
			runHumanCli(['--lang=es', '--help'], process.cwd()),
		);
		expect(es.text).toContain('Opciones globales:');
		expect(es.text).toContain('Comandos:');

		const ja = await captureStdout(() =>
			runHumanCli(['--lang=ja', '--help'], process.cwd()),
		);
		expect(ja.text).toContain('グローバルフラグ:');

		const fallback = await captureStdout(() =>
			runHumanCli(['--lang=zz', '--help'], process.cwd()),
		);
		expect(fallback.text).toContain('Global flags:');
	});
});

describe('init/init:default honor --workspace (a00061)', () => {
	const scratchDirs: string[] = [];
	const mktemp = (prefix: string): string => {
		const dir = mkdtempSync(join(tmpdir(), prefix));
		scratchDirs.push(dir);
		return dir;
	};

	afterEach(() => {
		for (const dir of scratchDirs.splice(0)) {
			rmSync(dir, { recursive: true, force: true });
		}
	});

	it('writes into --workspace, NOT the process cwd it was invoked from', async () => {
		const fakeCwd = mktemp('delendai-fake-cwd-');
		const targetWorkspace = mktemp('delendai-target-workspace-');
		await runHumanCli(
			['init:default', `--workspace=${targetWorkspace}`, '--json'],
			fakeCwd,
		);
		expect(existsSync(join(targetWorkspace, 'delendai.config.json'))).toBe(
			true,
		);
		expect(existsSync(join(fakeCwd, 'delendai.config.json'))).toBe(false);
	});
});

const captureStdout = async (
	fn: () => Promise<number>,
): Promise<{ readonly code: number; readonly text: string }> => {
	const writes: string[] = [];
	const original = process.stdout.write;
	process.stdout.write = ((chunk: string) => {
		writes.push(chunk);
		return true;
	}) as typeof process.stdout.write;
	try {
		const code = await fn();
		return { code, text: writes.join('') };
	} finally {
		process.stdout.write = original;
	}
};
