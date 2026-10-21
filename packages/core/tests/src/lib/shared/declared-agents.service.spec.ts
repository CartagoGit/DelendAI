/**
 * declared-agents.service.spec.ts — known agents from declarations, the
 * registry and the machine; a binary installed only when its sha256 matches.
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import type { IClientCommandRunner } from '../../../../src/lib/contracts/interfaces/known-client.interface';
import type { IAgentRegistry } from '../../../../src/lib/contracts/interfaces/public-catalogue.interface';
import {
	agentInstallDir,
	declaredLaunch,
	installAgentBinary,
	knownAgents,
} from '../../../../src/lib/shared/declared-agents.service';

const BYTES = new TextEncoder().encode('archive bytes');
const SUM = createHash('sha256').update(BYTES).digest('hex');
const REGISTRY: IAgentRegistry = {
	agents: [
		{
			id: 'qwen-code',
			name: 'Qwen Code',
			version: '1',
			distribution: { npx: { package: 'qwen-code@1', args: ['--acp'] } },
		},
		{
			id: 'goose',
			name: 'goose',
			version: '1.5',
			distribution: {
				binary: {
					'linux-x86_64': {
						archive: 'https://x.test/goose.tar.gz',
						cmd: './goose',
						args: ['acp'],
						sha256: SUM,
					},
				},
			},
		},
		{
			id: 'unseen',
			name: 'Unseen',
			version: '1',
			distribution: { npx: { package: 'unseen@1' } },
		},
	],
};

describe('declaredLaunch', () => {
	it('starts an ACP declaration by its command or its distribution; nothing for other kinds', () => {
		expect(
			declaredLaunch({
				id: 'a',
				kind: 'acp',
				command: 'my-agent',
				args: ['--acp'],
			}),
		).toEqual({
			command: 'my-agent',
			args: ['--acp'],
		});
		expect(
			declaredLaunch({
				id: 'b',
				kind: 'acp',
				distribution: { npx: { package: 'b@1' } },
			})?.command,
		).toBe('npx');
		expect(declaredLaunch({ id: 'c', kind: 'acp' })).toBeUndefined();
		expect(
			declaredLaunch({ id: 'd', kind: 'http', url: 'https://d.test' }),
		).toBeUndefined();
	});
});

describe('knownAgents', () => {
	const detected = [
		{
			registryId: 'goose',
			name: 'goose',
			foundIn: 'path' as const,
			evidence: 'goose is on PATH',
			executable: 'goose',
		},
		{
			registryId: 'qwen-code',
			name: 'Qwen Code',
			foundIn: 'package' as const,
			evidence: 'qwen-code is installed globally',
		},
		{
			name: 'pub.chat-1.0.0',
			foundIn: 'ide' as const,
			evidence:
				'VS Code has the extension pub.chat-1.0.0, filed under AI',
		},
	];

	it('lists what the machine shows, with how each starts, and the person over the project', () => {
		const agents = knownAgents({
			registry: REGISTRY,
			project: [
				{ id: 'qwen-code', kind: 'cli', command: 'qwen' },
				{ id: 'team-bot', kind: 'http', url: 'https://bot.test' },
			],
			personal: [
				{ id: 'team-bot', kind: 'acp', command: 'bot', args: ['acp'] },
			],
			detected,
		});
		const byId = new Map(agents.map((agent) => [agent.id, agent]));
		expect(byId.get('qwen-code')).toMatchObject({
			origin: 'project',
			kind: 'cli',
			launch: undefined,
		});
		expect(byId.get('team-bot')).toMatchObject({
			origin: 'personal',
			launch: { command: 'bot', args: ['acp'] },
		});
		expect(byId.get('goose')).toMatchObject({
			origin: 'detected',
			launch: { command: 'goose', args: ['acp'] },
		});
		expect(byId.get('pub.chat-1.0.0')).toMatchObject({
			kind: 'extension',
			origin: 'detected',
		});
		expect(byId.has('unseen')).toBe(false);
	});

	it('lists every registry agent when asked, and starts an installed binary from its folder', () => {
		const agents = knownAgents({
			registry: REGISTRY,
			all: true,
			installedDir: (agent) =>
				agent.id === 'goose' ? '/opt/goose' : undefined,
		});
		expect(agents.find((agent) => agent.id === 'unseen')?.origin).toBe(
			'registry',
		);
		expect(
			agents.find((agent) => agent.id === 'goose')?.launch?.command,
		).toBe(join('/opt/goose', './goose'));
	});
});

describe('installAgentBinary', () => {
	const goose = REGISTRY.agents[1]!;
	const unpacked: string[] = [];
	const run: IClientCommandRunner = async (command) => {
		unpacked.push(command);
		return { code: 0, output: '' };
	};

	it('installs the archive the registry names, checked by its sha256, and unpacks it', async () => {
		const root = mkdtempSync(join(tmpdir(), 'agents-'));
		const done = await installAgentBinary(goose, {
			platform: 'linux-x86_64',
			root,
			download: async () => BYTES,
			run,
		});
		expect(done.dir).toBe(agentInstallDir(goose, root));
		expect(done.launch).toEqual({
			command: join(done.dir, './goose'),
			args: ['acp'],
		});
		expect(unpacked[0]).toContain('tar -xf');
		expect(existsSync(join(done.dir, 'goose.tar.gz'))).toBe(false);
	});

	it('refuses an archive whose sha256 does not match, a missing sum and a missing platform', async () => {
		const root = mkdtempSync(join(tmpdir(), 'agents-'));
		await expect(
			installAgentBinary(goose, {
				platform: 'linux-x86_64',
				root,
				download: async () => new Uint8Array([1]),
				run,
			}),
		).rejects.toThrow('does not match its sha256');
		await expect(
			installAgentBinary(goose, {
				platform: 'darwin-aarch64',
				root,
				run,
			}),
		).rejects.toThrow('no binary');
		const unsigned = {
			...goose,
			distribution: {
				binary: {
					'linux-x86_64': {
						archive: 'https://x.test/g.zip',
						cmd: './g',
					},
				},
			},
		};
		await expect(
			installAgentBinary(unsigned, {
				platform: 'linux-x86_64',
				root,
				run,
			}),
		).rejects.toThrow('no sha256');
	});
});
