/**
 * project-hosts.service.spec.ts — the hosts a project uses: declared,
 * else found; and each one's agent in its own format.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { AGENT_HOSTS } from '@delendai/core/lib/contracts/constants/agent-hosts.constant';
import { renderAgentForHosts } from '@delendai/core/lib/hosts/agent-renderers.helper';
import { readDeclaredHosts } from '@delendai/core/lib/hosts/declared-hosts.helper';
import {
	knownHostIds,
	projectAgentHosts,
} from '@delendai/core/lib/hosts/project-hosts.service';
import { scaffoldHostProject } from '@delendai/core/lib/scaffold/scaffold-host';

describe('projectAgentHosts', () => {
	const dirs: string[] = [];
	afterEach(() => {
		for (const dir of dirs.splice(0))
			rmSync(dir, { recursive: true, force: true });
	});
	const project = (): string => {
		const root = mkdtempSync(join(tmpdir(), 'project-hosts-'));
		dirs.push(root);
		return root;
	};
	const ids = (found: Awaited<ReturnType<typeof projectAgentHosts>>) =>
		found.hosts.map((host) => host.id);

	it('takes the declared hosts, the environment over the configuration', async () => {
		const root = project();
		expect(
			await projectAgentHosts({ root, declared: ['cursor'], env: {} }),
		).toMatchObject({
			source: 'declared',
		});
		expect(
			ids(
				await projectAgentHosts({
					root,
					declared: ['cursor'],
					env: {},
				}),
			),
		).toEqual(['cursor']);
		expect(
			ids(
				await projectAgentHosts({
					root,
					declared: ['cursor'],
					env: { DELENDAI_HOSTS: 'opencode, gemini' },
				}),
			),
		).toEqual(['opencode', 'gemini']);
	});

	it('finds the hosts the tree and the environment show, and none in an empty project', async () => {
		const root = project();
		expect(await projectAgentHosts({ root, env: {} })).toEqual({
			hosts: [],
			source: 'none',
		});
		mkdirSync(join(root, '.opencode'));
		writeFileSync(join(root, 'GEMINI.md'), '# g\n');
		const found = await projectAgentHosts({
			root,
			env: { CLAUDECODE: '1' },
		});
		expect(found.source).toBe('detected');
		expect(ids(found)).toEqual(['claude', 'opencode', 'gemini']);
		expect(knownHostIds()).toContain('agents-md');
	});

	it('reads the hosts a configuration declares, and nothing from a missing or odd one', async () => {
		const root = project();
		expect(await readDeclaredHosts(root)).toBeUndefined();
		writeFileSync(
			join(root, 'delendai.config.json'),
			'{\n\t// mine\n\t"hosts": ["codex"]\n}\n',
		);
		expect(await readDeclaredHosts(root)).toEqual(['codex']);
		writeFileSync(join(root, 'delendai.config.json'), '{ "hosts": [1] }\n');
		expect(await readDeclaredHosts(root)).toBeUndefined();
	});

	it('renders one agent per host that reads agent files, in its format', () => {
		const files = renderAgentForHosts(AGENT_HOSTS, {
			name: 'acme-orchestrator',
			description: 'Root',
			instructions: 'Do it.\n',
			entryPoint: true,
			serverToolSet: 'acme-tools',
		});
		expect(files.map((file) => file.path)).toEqual([
			'.github/agents/acme-orchestrator.agent.md',
			'.claude/agents/acme-orchestrator.md',
			'.codex/agents/acme-orchestrator.md',
			'.opencode/agent/acme-orchestrator.md',
		]);
		expect(files[0]?.content).toContain('agent, acme-tools/*]');
		expect(files[0]?.content).toContain('user-invocable: true');
		expect(files[3]?.content).toContain('mode: primary');
	});

	it('scaffolds agents only for the hosts named', () => {
		const paths = scaffoldHostProject({
			projectName: 'Acme',
			namespacePrefix: 'acme',
			projectPackageName: '@acme/mcp-project',
			existingDelendai: true,
			hosts: ['opencode'],
		})
			.map((file) => file.path)
			.filter((path) => /agents?\//u.test(path));
		expect(paths.length).toBeGreaterThan(0);
		expect(paths.every((path) => path.startsWith('.opencode/agent/'))).toBe(
			true,
		);
	});
});
