/**
 * gen/web-pages.spec.ts — c00142 / q00006 Track I.
 *
 * Pure tests for the web-pages drift-check orchestration. We never
 * touch the real filesystem or the real generators — `Bun.spawn`
 * is replaced with a fake that records every invocation and returns
 * a pre-programmed result. The integration scenario (run all
 * generators + diff against the tree) is covered by the existing
 * tier3 `drift` job; this file locks down the script's own logic —
 * step ordering, exit-code mapping, --only / --list behaviour, and
 * the per-step drift reporter.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

import { run, type ISpawnedProcess, type SpawnFn } from './web-pages.script';

interface IRecordedCall {
	readonly cmd: readonly string[];
}

const calls: IRecordedCall[] = [];
let stdoutText = '';

const makeSpawn =
	(diffExit: number, statusPorcelain: string) =>
	(
		_cmd: readonly string[],
		_options: Parameters<SpawnFn>[1],
	): ISpawnedProcess => {
		const cmd = _cmd;
		calls.push({ cmd });
		if (cmd[0] === 'git' && cmd[1] === 'diff' && cmd[2] === '--exit-code') {
			return {
				exited: Promise.resolve(diffExit),
			};
		}
		if (
			cmd[0] === 'git' &&
			cmd[1] === 'status' &&
			cmd[2] === '--porcelain'
		) {
			return {
				exited: Promise.resolve(0),
				stdout: new ReadableStream<Uint8Array<ArrayBuffer>>({
					start(controller) {
						const encoded = new TextEncoder().encode(
							statusPorcelain,
						);
						const bytes = new Uint8Array(
							new ArrayBuffer(encoded.byteLength),
						);
						bytes.set(encoded);
						controller.enqueue(bytes);
						controller.close();
					},
				}),
			};
		}
		return {
			exited: Promise.resolve(stdoutText === 'fail' ? 1 : 0),
		};
	};

afterEach(() => {
	calls.length = 0;
	stdoutText = '';
	vi.restoreAllMocks();
});

const captureStderr = (): { text: () => string; restore: () => void } => {
	const chunks: string[] = [];
	const spy = vi
		.spyOn(process.stderr, 'write')
		.mockImplementation((chunk) => {
			chunks.push(typeof chunk === 'string' ? chunk : String(chunk));
			return true;
		});
	return {
		restore: () => spy.mockRestore(),
		text: () => chunks.join(''),
	};
};

const captureStdout = (): { restore: () => void; text: () => string } => {
	const chunks: string[] = [];
	const spy = vi
		.spyOn(process.stdout, 'write')
		.mockImplementation((chunk) => {
			chunks.push(typeof chunk === 'string' ? chunk : String(chunk));
			return true;
		});
	return {
		restore: () => spy.mockRestore(),
		text: () => chunks.join(''),
	};
};

describe('web-pages.script.ts (c00142)', () => {
	it('runs every step in --check mode and exits 0 when fresh', async () => {
		const exit = await run({
			argv: ['--check'],
			spawn: makeSpawn(0, ''),
		});
		expect(exit).toBe(0);
		// 6 generator spawns + 1 `git diff --exit-code`.
		expect(calls.length).toBe(7);
		expect(calls[0]?.cmd[0]).toBe('bun');
		expect(calls[6]?.cmd.slice(0, 3)).toEqual([
			'git',
			'diff',
			'--exit-code',
		]);
	});

	it('exits 1 with a per-step report when a tracked output drifted', async () => {
		const stderr = captureStderr();
		const exit = await run({
			argv: ['--check'],
			spawn: makeSpawn(
				1,
				' M apps/web/src/data/manifests/capabilities.json\n M apps/web/src/data/manifests/pages.json\n',
			),
		});
		const text = stderr.text();
		stderr.restore();
		expect(exit).toBe(1);
		expect(text).toContain('capabilities drifted');
		expect(text).toContain('apps/web/src/data/manifests/capabilities.json');
		expect(text).toContain('gen-capabilities.ts');
		expect(text).toContain('pages drifted');
		expect(text).toContain('gen-pages.ts');
	});

	it('exits 2 for an unknown --only selector', async () => {
		const exit = await run({
			argv: ['--only', 'bogus'],
			spawn: makeSpawn(0, ''),
		});
		expect(exit).toBe(2);
		expect(calls).toHaveLength(0);
	});

	it('prints the step list with --list and exits 0', async () => {
		const stdout = captureStdout();
		const exit = await run({
			argv: ['--list'],
			spawn: makeSpawn(0, ''),
		});
		const text = stdout.text();
		stdout.restore();
		expect(exit).toBe(0);
		expect(text).toContain('pages:');
		expect(text).toContain('capabilities:');
		expect(text).toContain('skills:');
		expect(text).toContain('from-manifests:');
		expect(text).toContain('web-catalog:');
		expect(text).toContain('observability-provenance:');
	});

	it('attributes provenance doc drift to the observability-provenance step', async () => {
		const stderr = captureStderr();
		const exit = await run({
			argv: ['--check'],
			spawn: makeSpawn(
				1,
				' M docs/delendai/generated/observability-provenance.generated.md\n',
			),
		});
		const text = stderr.text();
		stderr.restore();
		expect(exit).toBe(1);
		expect(text).toContain('observability-provenance drifted');
		expect(text).toContain(
			'docs/delendai/generated/observability-provenance.generated.md',
		);
		expect(text).toContain('provenance-truth.script.ts');
	});

	it('runs only the named step with --only', async () => {
		const exit = await run({
			argv: ['--only', 'pages'],
			spawn: makeSpawn(0, ''),
		});
		expect(exit).toBe(0);
		expect(calls).toHaveLength(1);
		expect(calls[0]?.cmd[1]).toBe('apps/web/scripts/gen-pages.ts');
	});

	it('returns 1 when a generator step exits non-zero', async () => {
		const stderr = captureStderr();
		// Tag the capabilities step to fail by name. Our fake doesn't
		// inspect cmd args, so we encode the desired exit into
		// stdoutText — simpler: build a custom fake here.
		const customSpawn: SpawnFn = (cmd, _options) => {
			calls.push({ cmd });
			const wantsFail =
				cmd[0] === 'bun' &&
				cmd[1] === 'apps/web/scripts/gen-capabilities.ts';
			return {
				exited: Promise.resolve(wantsFail ? 2 : 0),
			};
		};
		const exit = await run({
			argv: [],
			spawn: customSpawn,
		});
		const text = stderr.text();
		stderr.restore();
		expect(exit).toBe(1);
		expect(text).toContain('capabilities');
	});
});
