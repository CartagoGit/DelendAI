/**
 * terminal-probe.spec.ts — f00418 S1.
 *
 * Unit specs for `TerminalProbeService`:
 *   - `probe()` returns a well-formed `ITerminalCapabilities`
 *     snapshot.
 *   - Each phase (shell detection, dialect probe, invocation profile)
 *     can be driven independently via the injected `driver` seam.
 *   - `measured` vs `inferred` confidence propagates from each
 *     individual probe.
 *   - Pager detection populates the `recommends.envOverrides` map
 *     with the standard `PAGER=cat`, `GIT_PAGER=cat`, etc.
 *   - The default constructor wires `node:child_process.execFile`
 *     without throwing on a CI-like Node runtime.
 */

import { describe, expect, it } from 'vitest';

import type { ITerminalProbeResult } from '../../contracts/interfaces/terminal-capabilities.interface';
import { TerminalProbeService } from './terminal-probe.service';

const ok = (stdout: string, stderr = ''): ITerminalProbeResult => ({
	stdout,
	stderr,
	exitCode: 0,
	timedOut: false,
});

const fail = (
	stdout: string,
	stderr = '',
	exitCode: number = 1
): ITerminalProbeResult => ({
	stdout,
	stderr,
	exitCode,
	timedOut: false,
});

const timedOut = (stdout = '', stderr = ''): ITerminalProbeResult => ({
	stdout,
	stderr,
	exitCode: null,
	timedOut: true,
});

/** A scripted driver: one canned response per command. */
class FakeDriver {
	readonly #scripts = new Map<string, () => ITerminalProbeResult>();
	readonly #default: () => ITerminalProbeResult;
	readonly #calls: string[] = [];

	constructor(defaultResponse: () => ITerminalProbeResult) {
		this.#default = defaultResponse;
	}

	script(
		argv: readonly string[],
		response: () => ITerminalProbeResult
	): this {
		this.#scripts.set(argv.slice().join('\u0001'), response);
		return this;
	}

	get calls(): readonly string[] {
		return this.#calls;
	}

	readonly runCommand = (
		argv: readonly string[],
		_timeoutMs: number
	): Promise<ITerminalProbeResult> => {
		const key = argv.join('\u0001');
		this.#calls.push(key);
		const scripted = this.#scripts.get(key);
		const result = scripted ? scripted() : this.#default();
		return Promise.resolve(result);
	};
}

const argvOf = (...argv: readonly string[]): readonly string[] => argv;

const withShell = async (
	value: string,
	run: () => Promise<void>
): Promise<void> => {
	const previous = process.env.SHELL;
	process.env.SHELL = value;
	try {
		await run();
	} finally {
		if (previous === undefined) delete process.env.SHELL;
		else process.env.SHELL = previous;
	}
};

describe('TerminalProbeService — constructors', () => {
	it('uses the default driver when none is provided', () => {
		const service = new TerminalProbeService();
		expect(service.driver).toBeDefined();
		expect(service.timeoutMs).toBeGreaterThan(0);
	});

	it('clamps the timeout window to the documented budget', () => {
		const tooSmall = new TerminalProbeService(undefined, -100);
		const tooLarge = new TerminalProbeService(undefined, 60_000);
		expect(tooSmall.timeoutMs).toBeGreaterThanOrEqual(1);
		expect(tooLarge.timeoutMs).toBeLessThanOrEqual(2_000);
	});

	it('uses the provided driver verbatim', () => {
		const fake = new FakeDriver(() => ok('x'));
		const service = new TerminalProbeService(fake);
		expect(service.driver).toBe(fake);
	});
});

describe('TerminalProbeService.detectShell', () => {
	it('classifies the detected shell as "bash" with a measured version', async () => {
		await withShell('/bin/bash', async () => {
			const driver = new FakeDriver(() => ok('/bin/bash'))
				.script(argvOf('/bin/bash', '-c', 'echo "$0"'), () =>
					ok('/bin/bash')
				)
				.script(
					argvOf('/bin/bash', '-c', 'echo "${BASH_VERSION:-}"'),
					() => ok('5.2.21(1)-release')
				)
				.script(
					argvOf(
						'/bin/bash',
						'-c',
						'case "$-" in *i*) echo interactive;; esac'
					),
					() => ok('')
				)
				.script(argvOf('/bin/bash', '-c', 'echo "$0"'), () =>
					ok('bash')
				);
			const service = new TerminalProbeService(driver);
			const descriptor = await service.detectShell();
			expect(descriptor.name).toBe('bash');
			expect(descriptor.version).toBe('5.2.21(1)-release');
			expect(descriptor.confidence).toBe('measured');
			expect(descriptor.isInteractive).toBe(false);
			expect(descriptor.initScriptsLoad).toBe(false);
		});
	});

	it('sets initScriptsLoad=true when interactive and non-interactive runs diverge', async () => {
		await withShell('/bin/zsh', async () => {
			const divergent = new FakeDriver(() => ok('__PROBE__'))
				.script(argvOf('/bin/bash', '-c', 'echo "$0"'), () =>
					ok('/bin/bash')
				)
				.script(
					argvOf('/bin/bash', '-c', 'echo "${BASH_VERSION:-}"'),
					() => ok('5.2.21(1)-release')
				)
				.script(
					argvOf(
						'/bin/bash',
						'-c',
						'case "$-" in *i*) echo interactive;; esac'
					),
					() => ok('')
				)
				.script(argvOf('/bin/bash', '-c', 'echo "$0"'), () =>
					ok('bash')
				)
				.script(argvOf('/bin/zsh', '-i', '-c', 'echo __PROBE__'), () =>
					ok('__PROBE__ with p10k noise')
				)
				.script(argvOf('/bin/zsh', '-c', 'echo __PROBE__'), () =>
					ok('__PROBE__')
				);
			const service = new TerminalProbeService(divergent);
			const descriptor = await service.detectShell();
			expect(descriptor.initScriptsLoad).toBe(true);
		});
	});

	it('marks every signal inferred when the driver times out', async () => {
		await withShell('/bin/bash', async () => {
			const timeoutDriver = new FakeDriver(() => timedOut());
			const service = new TerminalProbeService(timeoutDriver, 100);
			const descriptor = await service.detectShell();
			expect(descriptor.confidence).toBe('inferred');
		});
	});
});

describe('TerminalProbeService.probeDialect', () => {
	it('reports every feature on with measured confidence when the driver agrees', async () => {
		await withShell('/bin/bash', async () => {
			const driver = new FakeDriver(() => ok('ok'))
				.script(argvOf('/bin/bash', '-c', 'cat <<EOF\nhi\nEOF'), () =>
					ok('hi\n')
				)
				.script(
					argvOf(
						'/bin/bash',
						'-c',
						'set -o pipefail; false | true; echo ok || echo fail'
					),
					() => ok('ok')
				)
				.script(
					argvOf(
						'/bin/bash',
						'-c',
						'printf "\\033[31mhi\\033[0m\\n"'
					),
					() => ok('\x1b[31mhi\x1b[0m\n')
				);
			const service = new TerminalProbeService(driver);
			const dialect = await service.probeDialect();
			expect(dialect).toMatchObject({
				pipes: true,
				heredoc: true,
				commandSubstitution: true,
				arrays: true,
				doubleBracket: true,
				pipefail: true,
				processSubstitution: true,
				timeout: true,
				stdbuf: true,
				ansiColor: true,
			});
			expect(dialect.confidence).toBe('measured');
		});
	});

	it('marks the dialect as inferred when most probes fail', async () => {
		await withShell('/bin/bash', async () => {
			const driver = new FakeDriver(() => fail('no'));
			const service = new TerminalProbeService(driver);
			const dialect = await service.probeDialect();
			expect(dialect.confidence).toBe('inferred');
		});
	});
});

describe('TerminalProbeService.probeInvocation', () => {
	it('reports sync+async safe modes and no pager when the PATH has none', async () => {
		await withShell('/bin/bash', async () => {
			const driver = new FakeDriver(() => ok(''))
				.script(argvOf('command', '-v', 'less'), () => fail(''))
				.script(argvOf('command', '-v', 'more'), () => fail(''))
				.script(argvOf('command', '-v', 'most'), () => fail(''))
				.script(
					argvOf('/bin/bash', '-c', 'printf %s "${PAGER:-}"'),
					() => ok('')
				)
				.script(
					argvOf(
						'/bin/bash',
						'-c',
						'git config --get core.pager 2>/dev/null || true'
					),
					() => ok('')
				);
			const service = new TerminalProbeService(driver);
			const profile = await service.probeInvocation();
			expect(profile.paged).toBe(false);
			expect(profile.pagers).toEqual([]);
			expect(profile.safeModes).toEqual(['sync', 'async']);
			expect(
				(profile.recommends.envOverrides as Record<string, string>)
					.PAGER
			).toBeUndefined();
		});
	});

	it('reports paged=true and populates recommended env overrides when less is found', async () => {
		await withShell('/bin/bash', async () => {
			const driver = new FakeDriver(() => ok(''))
				.script(argvOf('command', '-v', 'less'), () =>
					ok('/usr/bin/less')
				)
				.script(argvOf('command', '-v', 'more'), () => fail(''))
				.script(argvOf('command', '-v', 'most'), () => fail(''));
			const service = new TerminalProbeService(driver);
			const profile = await service.probeInvocation();
			expect(profile.paged).toBe(true);
			expect(profile.pagers).toEqual(['less']);
			expect(profile.safeModes).toEqual(['async']);
			expect(
				profile.recommends.envOverrides as Record<string, string>
			).toMatchObject({
				PAGER: 'cat',
				GIT_PAGER: 'cat',
				SYSTEMD_PAGER: 'cat',
			});
			expect(profile.recommends.noPagerFlags).toContain('--no-pager');
		});
	});
});

describe('TerminalProbeService.probe', () => {
	it('returns the well-formed snapshot when the driver is well-behaved', async () => {
		await withShell('/bin/bash', async () => {
			const driver = new FakeDriver(() => ok('ok'));
			const service = new TerminalProbeService(driver);
			const snapshot = await service.probe();
			expect(snapshot.generatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/u);
			expect(snapshot.probeMs).toBeGreaterThanOrEqual(0);
			expect(snapshot.shell.name).toBe('bash');
			expect(snapshot.supports.doubleBracket).toBe(true);
		});
	});
});
