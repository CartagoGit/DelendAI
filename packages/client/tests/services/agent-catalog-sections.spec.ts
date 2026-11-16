/**
 * The catalog is asked for by section: whole, it passes a response's ceiling.
 */
import { describe, expect, it } from 'vitest';

import { AgentCatalogService } from '../../src/lib/services/agent-catalog-service';
import { McpStdioClient } from '../../src/lib/transport/mcp-stdio-client';

const whole = {
	tools: [
		{ name: 'd_alpha', summary: 'first', tags: ['one'] },
		{ name: 'd_beta_run', plugin: 'beta', effects: ['read'] },
	],
	skills: [
		{
			id: 'a-skill',
			version: '1.0.0',
			minCoreVersion: '0.1.0',
			summary: 'how',
			appliesTo: [],
			tags: ['one'],
			bodyPath: 'a',
		},
		{ id: 'bare-skill', tags: [] },
	],
	proposals: [
		{ id: 'f1', title: 'Alpha', track: 't', status: 'ready', kind: 'feat' },
	],
	counts: {},
};

const harness = (at: () => number = () => 0) => {
	const asked: unknown[] = [];
	const client = McpStdioClient.fromTransport({
		async callTool({ name, arguments: args }) {
			asked.push(args);
			if (name.endsWith('_skill')) {
				const { id } = args as { id: string };
				return {
					structuredContent:
						id === 'a-skill' ? { body: 'the body' } : {},
				};
			}
			const { section } = args as { section: keyof typeof whole };
			return {
				structuredContent: {
					...whole,
					tools: section === 'tools' ? whole.tools : [],
					skills: section === 'skills' ? whole.skills : [],
					proposals: section === 'proposals' ? whole.proposals : [],
				},
			};
		},
	});
	return {
		asked,
		service: new AgentCatalogService(client, {
			namespacePrefix: 'd',
			ttlMs: 10,
			now: at,
		}),
	};
};

describe('the agent catalog by section', () => {
	it('[<30ms] asks only for the section it is asked about', async () => {
		const { service, asked } = harness();
		expect(await service.getProposals()).toHaveLength(1);
		expect(asked).toEqual([{ mode: 'full', section: 'proposals' }]);
	});

	it('[<30ms] fills what a skill row leaves out', async () => {
		const { service } = harness();
		const [, bare] = await service.getSkills();
		expect(bare).toMatchObject({ version: '0.0.0' });
		expect(bare).not.toHaveProperty('bodyPath');
	});

	it('[<30ms] filters a section by query', async () => {
		const { service } = harness();
		expect(await service.getTools('alpha')).toHaveLength(1);
		expect(await service.getTools('nothing')).toHaveLength(0);
	});

	it('[<30ms] keeps a tool plugin and effects, and a skill body path, when the server sends them', async () => {
		const { service } = harness();
		const [, beta] = await service.getTools();
		expect(beta).toMatchObject({ plugin: 'beta', effects: ['read'] });
		const [withPath] = await service.getSkills('one');
		expect(withPath).toMatchObject({ id: 'a-skill', bodyPath: 'a' });
		expect(await service.getSkills('nothing')).toHaveLength(0);
		expect(await service.getTools('beta')).toHaveLength(1);
	});

	it('[<30ms] searches every section, each asked for once', async () => {
		const { service, asked } = harness();
		const found = await service.search('alpha');
		expect(found.tools).toHaveLength(1);
		expect(found.proposals).toHaveLength(1);
		expect(asked).toHaveLength(3);
	});

	it('[<30ms] answers from its cache until it expires or is invalidated', async () => {
		let now = 0;
		const { service, asked } = harness(() => now);
		await service.getSkills();
		await service.getSkills();
		expect(asked).toHaveLength(1);
		now = 11;
		await service.getSkills();
		expect(asked).toHaveLength(2);
		service.invalidate();
		await service.getSkills();
		expect(asked).toHaveLength(3);
	});

	it('[<30ms] loads a skill body and refuses one with none', async () => {
		const { service } = harness();
		expect(await service.getSkillBody('a-skill')).toBe('the body');
		await expect(service.getSkillBody('none')).rejects.toThrow('body');
	});
});
