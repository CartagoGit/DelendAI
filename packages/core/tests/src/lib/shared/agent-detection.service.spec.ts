/**
 * agent-detection.service.spec.ts — agents found by their own names on
 * PATH, among global packages and IDE extensions, with whole-name matches
 * only, and unknown executables asked for their help.
 */
import { describe, expect, it } from 'vitest';

import type { IModelCatalogue } from '../../../../src/lib/contracts/interfaces/account-finding.interface';
import type { IDetectionMachine } from '../../../../src/lib/contracts/interfaces/agent-detection.interface';
import type { IAgentRegistry } from '../../../../src/lib/contracts/interfaces/public-catalogue.interface';
import {
	catalogueWords,
	detectAgents,
	extensionNames,
	namesOf,
	packageName,
} from '../../../../src/lib/shared/agent-detection.service';

const REGISTRY: IAgentRegistry = {
	agents: [
		{
			id: 'opencode',
			name: 'OpenCode',
			version: '1',
			distribution: {
				binary: { 'linux-x86_64': { archive: 'a', cmd: './opencode' } },
			},
		},
		{
			id: 'claude-acp',
			name: 'Claude Agent',
			version: '1',
			distribution: {
				npx: { package: '@agentclientprotocol/claude-agent-acp@0.9.4' },
			},
		},
		{
			id: 'qwen-code',
			name: 'Qwen Code',
			version: '1',
			distribution: { npx: { package: 'qwen-code@0.25.3' } },
		},
		{
			id: 'minimax-code',
			name: 'MiniMax Code',
			version: '1',
			distribution: { npx: { package: '@minimax/code@0.2.7' } },
		},
		{ id: 'cursor', name: 'Cursor', version: '1', distribution: {} },
	],
};
const CATALOGUE: IModelCatalogue = {
	fetchedAt: '',
	providers: [
		{ id: 'deepseek', name: 'DeepSeek', env: [], models: ['deepseek-v4'] },
	],
};

const machine = (
	over: Partial<IDetectionMachine> & { helps?: Record<string, string> } = {},
): IDetectionMachine & { asked: string[] } => {
	const asked: string[] = [];
	return {
		asked,
		executables:
			over.executables ??
			(async () => [
				'opencode',
				'claude',
				'code.cmd',
				'deepseek-cli',
				'deepseek-tool',
				'ls',
			]),
		globalPackages: over.globalPackages ?? (async () => ['qwen-code']),
		ideExtensions:
			over.ideExtensions ??
			(async () => [
				{ ide: 'VS Code', id: 'sst-dev.opencode-0.0.13' },
				{
					ide: 'VS Code',
					id: 'cardinal90.multi-cursor-case-preserve-1.0.5',
				},
				{
					ide: 'VS Code',
					id: 'some.chat-helper-1.0.0',
					manifest: JSON.stringify({ categories: ['AI'] }),
				},
				{
					ide: 'VS Code',
					id: 'some.chat-helper-1.1.0',
					manifest: JSON.stringify({ categories: ['AI'] }),
				},
				{
					ide: 'VS Code',
					id: 'x.theme-1.0.0',
					manifest: JSON.stringify({ categories: ['Themes'] }),
				},
				{ ide: 'VS Code', id: 'y.broken-1.0.0', manifest: 'not json' },
			]),
		help: async (executable) => {
			asked.push(executable);
			return over.helps?.[executable] ?? '';
		},
	};
};

describe('names', () => {
	it('reads the names an agent is installed under, never a scoped package tail', () => {
		expect([...namesOf(REGISTRY.agents[0]!)]).toContain('opencode');
		expect([...namesOf(REGISTRY.agents[1]!)]).toEqual([
			'claude-acp',
			'claude',
			'claude-agent',
		]);
		expect(namesOf(REGISTRY.agents[3]!).has('code')).toBe(false);
		expect(packageName('@a/b@1.0')).toBe('@a/b');
		expect(packageName('b@1')).toBe('b');
		expect(extensionNames('anthropic.claude-code-2.1.3-linux-x64')).toEqual(
			['claude-code', 'claude'],
		);
		expect(extensionNames('plain')).toEqual(['plain', 'plain']);
	});

	it('takes its vocabulary from the catalogues, without short words', () => {
		const words = catalogueWords(REGISTRY, CATALOGUE);
		expect(words.has('deepseek')).toBe(true);
		expect(words.has('qwen')).toBe(true);
		expect([...words].every((word) => word.length >= 4)).toBe(true);
	});
});

describe('detectAgents', () => {
	it('finds registry agents on PATH, in packages and in IDEs, by whole names', async () => {
		const found = await detectAgents({
			machine: machine(),
			registry: REGISTRY,
			catalogue: CATALOGUE,
		});
		const lines = found.map(
			(each) => `${each.foundIn} ${each.registryId ?? '-'}`,
		);
		expect(lines).toContain('path opencode');
		expect(lines).toContain('path claude-acp');
		expect(lines).toContain('package qwen-code');
		expect(lines).toContain('ide opencode');
		expect(lines).not.toContain('path minimax-code');
		expect(lines).not.toContain('ide cursor');
	});

	it('lists an AI extension once whatever versions sit side by side', async () => {
		const found = await detectAgents({
			machine: machine(),
			registry: REGISTRY,
		});
		const ai = found.filter((each) =>
			each.evidence.includes('filed under AI'),
		);
		expect(ai.map((each) => each.name)).toEqual(['some.chat-helper-1.0.0']);
	});

	it('asks an unknown executable for help only when its name carries a catalogue word', async () => {
		const box = machine({
			helps: {
				'deepseek-cli':
					'Usage: deepseek-cli --model deepseek-v4\nSet DEEPSEEK_API_KEY first.',
				'deepseek-tool':
					'Usage: deepseek-tool <file>\nby DeepSeek fans',
			},
		});
		const found = await detectAgents({
			machine: box,
			registry: REGISTRY,
			catalogue: CATALOGUE,
		});
		expect(box.asked.sort()).toEqual(['deepseek-cli', 'deepseek-tool']);
		expect(
			found
				.filter((each) => each.foundIn === 'path-candidate')
				.map((each) => each.evidence),
		).toEqual([
			'deepseek-cli is on PATH and its help names DEEPSEEK_API_KEY',
		]);
	});

	it('offers a candidate whose help speaks ACP, or names a provider beside models', async () => {
		const acp = machine({
			executables: async () => ['deepseek-acp'],
			helps: { 'deepseek-acp': 'Speaks ACP over stdio' },
		});
		expect(
			(
				await detectAgents({
					machine: acp,
					registry: undefined,
					catalogue: CATALOGUE,
				})
			)[0]?.evidence,
		).toContain('ACP');
		const named = machine({
			executables: async () => ['deepseek-x'],
			helps: { 'deepseek-x': 'Chat with DeepSeek models' },
		});
		expect(
			(
				await detectAgents({
					machine: named,
					registry: undefined,
					catalogue: CATALOGUE,
				})
			)[0]?.evidence,
		).toContain('DeepSeek');
	});
});
