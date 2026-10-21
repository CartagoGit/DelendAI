/**
 * acp-client.service.spec.ts — an agent started from its registry entry
 * and driven over stdio; a process that will not answer is stopped.
 */
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { describe, expect, it } from 'vitest';

import type { IRegistryAgent } from '../../../../src/lib/contracts/interfaces/public-catalogue.interface';
import {
	acpLaunchOf,
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
	it('starts a package through npx or uvx, as the registry names it', () => {
		expect(
			acpLaunchOf(
				entry({ npx: { package: '@q/code@1.0.0', args: ['--acp'] } }),
			),
		).toEqual({
			command: 'npx',
			args: ['-y', '@q/code@1.0.0', '--acp'],
			env: undefined,
		});
		expect(
			acpLaunchOf(entry({ uvx: { package: 'fast-agent-acp' } }))?.args,
		).toEqual(['fast-agent-acp']);
	});

	it('starts a binary only from where it was installed, for this platform', () => {
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

	it('names platforms the way the registry does', () => {
		expect(registryPlatform('linux', 'x64')).toBe('linux-x86_64');
		expect(registryPlatform('darwin', 'arm64')).toBe('darwin-aarch64');
		expect(registryPlatform('win32', 'x64')).toBe('windows-x86_64');
	});
});

describe('runAcpAgent', () => {
	it('drives a real process over stdio and stops it', async () => {
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

	it('fails when the process cannot start or ends before answering', async () => {
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

	it('stops the agent when the turn is cancelled', async () => {
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
