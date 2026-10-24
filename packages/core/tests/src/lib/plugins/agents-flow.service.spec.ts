/**
 * agents-flow.service.spec.ts — listing, declaring and installing the
 * agents of a project, against a temp workspace and person's root.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import type { IDetectionMachine } from '../../../../src/lib/contracts/interfaces/agent-detection.interface';
import type { IAgentRegistry } from '../../../../src/lib/contracts/interfaces/public-catalogue.interface';
import {
	declareAgent,
	installAgent,
	listAgents,
} from '../../../../src/lib/plugins/agents-flow.service';

const REGISTRY: IAgentRegistry = {
	agents: [
		{
			id: 'qwen-code',
			name: 'Qwen Code',
			version: '1',
			distribution: { npx: { package: 'qwen-code@1' } },
		},
		{
			id: 'bin-only',
			name: 'Bin',
			version: '1',
			distribution: {
				binary: {
					'linux-x86_64': {
						archive: 'https://x.test/b.tgz',
						cmd: './b',
					},
				},
			},
		},
	],
};
const empty: IDetectionMachine = {
	executables: async () => ['qwen-code'],
	globalPackages: async () => [],
	ideExtensions: async () => [],
	help: async () => '',
};

const setUp = () => {
	const workspace = mkdtempSync(join(tmpdir(), 'agents-ws-'));
	execFileSync('git', ['init', '-q', workspace]);
	return {
		workspace,
		personalRoot: mkdtempSync(join(tmpdir(), 'agents-cfg-')),
	};
};

describe('agents flow', () => {
	it('declares an agent in the person’s file, then lists it beside what the machine shows', async () => {
		const { workspace, personalRoot } = setUp();
		writeFileSync(
			join(workspace, 'delendai.config.json'),
			JSON.stringify({
				agents: [{ id: 'team', kind: 'http', url: 'https://t.test' }],
			}),
		);
		const declared = await declareAgent({
			workspace,
			personalRoot,
			agent: { id: 'mine', kind: 'acp', command: 'mine', args: ['acp'] },
		});
		expect(declared.added).toBe(true);
		expect(
			JSON.parse(readFileSync(declared.personalLayer, 'utf8')).agents,
		).toEqual([
			{ id: 'mine', kind: 'acp', command: 'mine', args: ['acp'] },
		]);
		expect(
			(
				await declareAgent({
					workspace,
					personalRoot,
					agent: { id: 'mine', kind: 'cli', command: 'x' },
				})
			).added,
		).toBe(false);
		const { agents } = await listAgents({
			workspace,
			personalRoot,
			machine: empty,
			registry: REGISTRY,
			catalogue: { fetchedAt: '', providers: [] },
		});
		expect(
			agents.map((agent) => `${agent.id}:${agent.origin}`).sort(),
		).toEqual(['mine:personal', 'qwen-code:detected', 'team:project']);
	});

	it('refuses an invalid declaration and writes nothing', async () => {
		const { workspace, personalRoot } = setUp();
		await expect(
			declareAgent({
				workspace,
				personalRoot,
				agent: { id: 'x', kind: 'http' },
			}),
		).rejects.toThrow('needs what reaches it');
		await expect(
			declareAgent({
				workspace,
				personalRoot,
				agent: { id: 'Bad Id', kind: 'cli', command: 'x' },
			}),
		).rejects.toThrow('id');
	});

	it('says a package agent needs no install, and refuses an unknown one', async () => {
		expect(
			(await installAgent({ id: 'qwen-code', registry: REGISTRY })).note,
		).toContain('npx');
		await expect(
			installAgent({ id: 'nope', registry: REGISTRY }),
		).rejects.toThrow('no agent nope');
		await expect(
			installAgent({
				id: 'bin-only',
				registry: REGISTRY,
				root: mkdtempSync(join(tmpdir(), 'r-')),
			}),
		).rejects.toThrow();
	});
});
