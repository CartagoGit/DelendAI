/**
 * acp-client.service.spec.ts — an agent started from its registry entry
 * and driven over stdio; a process that will not answer is stopped.
 */
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { describe, expect, it } from 'vitest';

import { useFakeClock } from '@delendai/test-kit';

import type { IRegistryAgent } from '../../../../src/lib/contracts/interfaces/public-catalogue.interface';
import {
	acpFetchRefusal,
	acpLaunchOf,
	introduceAgent,
	pinnedPackage,
	registryPlatform,
	runAcpAgent,
} from '../../../../src/lib/shared/acp-client.service';

const FAKE = join(import.meta.dirname, 'fixtures', 'fake-acp-agent.ts');

const entry = (
	distribution: IRegistryAgent['distribution'],
): IRegistryAgent => ({
	id: 'x',
	name: 'X',
	version: '1',
	distribution,
});

describe('acpLaunchOf', () => {
	it('[<8ms] starts a package through npx or uvx only when the project allowed that exact package', () => {
		const coder = entry({
			npx: { package: '@q/code@1.0.0', args: ['--acp'] },
		});
		expect(
			acpLaunchOf(coder, { trusted: new Set(['@q/code@1.0.0']) }),
		).toEqual({
			command: 'npx',
			args: ['-y', '@q/code@1.0.0', '--acp'],
			env: undefined,
			fromNetwork: 'npx @q/code@1.0.0',
		});
		expect(acpLaunchOf(coder)).toBeUndefined();
		// Another version is another package: not allowed by this one.
		expect(
			acpLaunchOf(coder, { trusted: new Set(['@q/code@1.0.1']) }),
		).toBeUndefined();
		expect(
			acpLaunchOf(entry({ uvx: { package: 'fast-agent-acp' } }), {
				trusted: new Set(['fast-agent-acp@1']),
			})?.args,
		).toEqual(['fast-agent-acp@1']);
	});

	it('[<6ms] runs the version the registry pins, and names the setting when it refuses', () => {
		expect(pinnedPackage('fast-agent-acp', '2.1.0')).toBe(
			'fast-agent-acp@2.1.0',
		);
		expect(pinnedPackage('@q/code@1.0.0', '9')).toBe('@q/code@1.0.0');
		expect(pinnedPackage('@q/code', '')).toBe('@q/code');
		expect(
			acpFetchRefusal(entry({ npx: { package: '@q/code@1.0.0' } })),
		).toBe(
			'x would be fetched from the network (npx @q/code@1.0.0) and this project has not allowed that package: add "@q/code@1.0.0" to `trustedAgentPackages` in delendai.config.json, or install the agent',
		);
		expect(
			acpFetchRefusal(
				entry({ npx: { package: '@q/code@1.0.0' } }),
				new Set(['@q/code@1.0.0']),
			),
		).toBeUndefined();
	});

	it('[<5ms] starts a binary only from where it was installed, for this platform', () => {
		const binary = entry({
			binary: {
				'linux-x86_64': { archive: 'a', cmd: './x', args: ['acp'] },
			},
		});
		expect(
			acpLaunchOf(binary, { platform: 'linux-x86_64' }),
		).toBeUndefined();
		expect(
			acpLaunchOf(binary, {
				platform: 'linux-x86_64',
				installedDir: '/opt/x',
			}),
		).toEqual({ command: join('/opt/x', './x'), args: ['acp'] });
		expect(
			acpLaunchOf(binary, {
				platform: 'darwin-aarch64',
				installedDir: '/o',
			}),
		).toBeUndefined();
	});

	it('[<5ms] names platforms the way the registry does', () => {
		expect(registryPlatform('linux', 'x64')).toBe('linux-x86_64');
		expect(registryPlatform('darwin', 'arm64')).toBe('darwin-aarch64');
		expect(registryPlatform('win32', 'x64')).toBe('windows-x86_64');
	});
});

describe('runAcpAgent', () => {
	it('[<420ms] drives a real process over stdio and stops it', async () => {
		const result = await runAcpAgent(
			{ command: process.execPath, args: [FAKE] },
			{ cwd: tmpdir(), prompt: 'abc', timeoutMs: 20_000 },
		);
		expect(result).toMatchObject({
			agent: { name: 'Fake Stdio' },
			stopReason: 'end_turn',
			text: 'cba',
		});
	});

	it('[<69ms] fails when the process cannot start or ends before answering', async () => {
		await expect(
			runAcpAgent(
				{ command: join(tmpdir(), 'no-such-agent'), args: [] },
				{ cwd: tmpdir(), prompt: 'x' },
			),
		).rejects.toThrow();
		await expect(
			runAcpAgent(
				{ command: process.execPath, args: ['-e', 'process.exit(3)'] },
				{ cwd: tmpdir(), prompt: 'x', timeoutMs: 20_000 },
			),
		).rejects.toThrow(/exited \(3\)|connection closed/u);
	});

	it('[<14ms] stops the agent when the turn is cancelled', async () => {
		const controller = new AbortController();
		const turn = runAcpAgent(
			{
				command: process.execPath,
				args: ['-e', 'setTimeout(() => {}, 60_000)'],
			},
			{
				cwd: tmpdir(),
				prompt: 'x',
				timeoutMs: 20_000,
				signal: controller.signal,
			},
		);
		controller.abort();
		await expect(turn).rejects.toThrow(/cancelled|connection closed/u);
		const already = new AbortController();
		already.abort();
		await expect(
			runAcpAgent(
				{ command: process.execPath, args: ['-e', ''] },
				{ cwd: tmpdir(), prompt: 'x', signal: already.signal },
			),
		).rejects.toThrow();
	});
});

const SILENT = {
	command: process.execPath,
	args: ['-e', 'setTimeout(() => {}, 60_000)'],
};

/** The turn's deadline: passed on a fake clock, not waited out. */
const DEADLINE_MS = 300;
const fakeDeadline = () =>
	useFakeClock({ toFake: ['setTimeout', 'clearTimeout'] });

describe('a turn that runs out of time', () => {
	it('[<12ms] stops an agent that never answers', async () => {
		const clock = fakeDeadline();
		const turn = expect(
			runAcpAgent(SILENT, {
				cwd: tmpdir(),
				prompt: 'x',
				timeoutMs: DEADLINE_MS,
			}),
		).rejects.toThrow(
			/took longer than the turn allows|connection closed/u,
		);
		clock.advance(DEADLINE_MS);
		await turn;
	});
});

describe('introduceAgent', () => {
	it('[<285ms] greets a real process and says what it is, at no cost', async () => {
		const introduction = await introduceAgent(
			{ command: process.execPath, args: [FAKE] },
			tmpdir(),
			20_000,
		);
		expect(introduction).toMatchObject({ agent: { name: 'Fake Stdio' } });
	});

	it('[<8ms] gives up on a process that does not answer in time', async () => {
		const clock = fakeDeadline();
		const greeting = expect(
			introduceAgent(SILENT, tmpdir(), DEADLINE_MS),
		).rejects.toThrow(/did not answer within 300 ms|connection closed/u);
		clock.advance(DEADLINE_MS);
		await greeting;
	});
});
