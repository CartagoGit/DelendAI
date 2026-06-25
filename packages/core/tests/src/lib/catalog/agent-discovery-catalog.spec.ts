import { describe, expect, it } from 'vitest';

import { buildCatalog } from '@mcp-vertex/core/lib/catalog/agent-discovery-catalog';
import type {
	ICatalogSources,
	IProposalSummary,
	ISkillSummary,
	IToolSummary,
} from '@mcp-vertex/core/lib/catalog/agent-discovery-types';
import { buildAgentCatalogToolRegistration } from '@mcp-vertex/core/lib/tools/agent-catalog-tool';

const server = {
	name: 'mcp-vertex',
	version: '1.2.3',
	namespacePrefix: 'mcp-vertex',
} as const;

const tools: readonly IToolSummary[] = [
	{
		name: 'search_search',
		plugin: 'search',
		summary: 'Find symbols and files',
		tags: ['find', 'lookup'],
	},
	{
		name: 'mcp-vertex_agent_catalog',
		plugin: 'mcp-vertex',
		summary: 'Unified catalog entrypoint',
		tags: ['orientation', 'catalog'],
	},
];

const skills: readonly ISkillSummary[] = [
	{
		id: 'mcp-vertex-token-budget-playbook',
		version: '1.0.0',
		minCoreVersion: '0.1.0',
		summary: 'Budget every response before it drifts.',
		appliesTo: ['@mcp-vertex/*'],
		tags: ['metrics', 'compact'],
		bodyPath:
			'packages/core/skills/mcp-vertex-token-budget-playbook/SKILL.md',
	},
	{
		id: 'mcp-vertex-audit-playbook',
		version: '1.0.0',
		minCoreVersion: '0.1.0',
		summary: 'Run exhaustive code audits.',
		appliesTo: ['@mcp-vertex/audit'],
		tags: ['audit'],
		bodyPath: 'plugins/audit/skills/mcp-vertex-audit-playbook/SKILL.md',
	},
];

const proposals: readonly IProposalSummary[] = [
	{
		id: 'f00056',
		title: 'Agent discovery catalog',
		track: 'host+extension+skills+docs',
		status: 'ready',
		kind: 'feat',
		date: '2026-06-25',
	},
	{
		id: 'c00002',
		title: 'Pause npm publish',
		track: 'docs+release',
		status: 'paused',
		kind: 'chore',
		date: '2026-06-21',
	},
	{
		id: 'a00001',
		title: 'Repository audit',
		track: 'archive',
		status: 'done',
		kind: 'audit',
		date: '2026-06-15',
	},
];

const sources: ICatalogSources = {
	tools: () => tools,
	skills: () => skills,
	proposals: () => proposals,
};

const fixedNow = () => new Date('2026-06-25T00:00:00.000Z');

const parseTextResult = (result: unknown): Record<string, unknown> => {
	const text = (result as { content: Array<{ type: string; text: string }> })
		.content[0]?.text;
	return JSON.parse(text ?? '{}') as Record<string, unknown>;
};

const registerToolHandler = async () => {
	let handler:
		| ((args: {
				mode?: 'compact' | 'full';
				section?: 'tools' | 'skills' | 'proposals';
				query?: string;
		  }) => Promise<unknown>)
		| undefined;
	const registration = buildAgentCatalogToolRegistration('mcp-vertex', {
		sources,
		server,
		now: fixedNow,
	});
	await registration.register({
		registerTool: (
			_name: string,
			_meta: unknown,
			toolHandler: (args: unknown) => Promise<unknown>,
		) => {
			handler = toolHandler;
		},
	} as never);
	if (handler === undefined) throw new Error('tool handler not registered');
	return handler;
};

describe('buildCatalog', async () => {
	it('sorts every section deterministically by stable ids', async () => {
		const snapshot = buildCatalog(
			{
				tools: () => [tools[0]!, tools[1]!],
				skills: () => [skills[0]!, skills[1]!],
				proposals: () => [proposals[0]!, proposals[2]!, proposals[1]!],
			},
			{ mode: 'full', now: fixedNow, server },
		);

		expect(snapshot.tools.map((entry) => entry.name)).toEqual([
			'mcp-vertex_agent_catalog',
			'search_search',
		]);
		expect(snapshot.skills.map((entry) => entry.id)).toEqual([
			'mcp-vertex-audit-playbook',
			'mcp-vertex-token-budget-playbook',
		]);
		expect(snapshot.proposals.map((entry) => entry.id)).toEqual([
			'a00001',
			'c00002',
			'f00056',
		]);
	});

	it('filters proposals in compact mode but keeps the full archive in full mode', async () => {
		const compact = buildCatalog(sources, {
			mode: 'compact',
			now: fixedNow,
			server,
		});
		const full = buildCatalog(sources, {
			mode: 'full',
			now: fixedNow,
			server,
		});

		expect(compact.proposals.map((entry) => entry.id)).toEqual([
			'c00002',
			'f00056',
		]);
		expect(full.proposals.map((entry) => entry.id)).toEqual([
			'a00001',
			'c00002',
			'f00056',
		]);
	});

	it('keeps count invariants for visible entries and full status counts', async () => {
		const snapshot = buildCatalog(sources, {
			mode: 'compact',
			now: fixedNow,
			server,
		});

		expect(snapshot.counts).toEqual({ tools: 2, skills: 2, proposals: 2 });
		expect(snapshot.proposalStatusCounts).toEqual({
			ready: 1,
			'in-progress': 0,
			review: 0,
			paused: 1,
			done: 1,
			blocked: 0,
			retired: 0,
			unspecified: 0,
		});
	});

	it('filters queries case-insensitively across name, summary, tag, id and title', async () => {
		const handler = await registerToolHandler();
		const toolResult = parseTextResult(
			await handler({ section: 'tools', query: 'CATALOG' }),
		);
		const skillResult = parseTextResult(
			await handler({ section: 'skills', query: 'METRICS' }),
		);
		const proposalResult = parseTextResult(
			await handler({ section: 'proposals', query: 'discovery' }),
		);

		expect((toolResult.tools as Array<{ name: string }>)[0]?.name).toBe(
			'mcp-vertex_agent_catalog',
		);
		expect((skillResult.skills as Array<{ id: string }>)[0]?.id).toBe(
			'mcp-vertex-token-budget-playbook',
		);
		expect((proposalResult.proposals as Array<{ id: string }>)[0]?.id).toBe(
			'f00056',
		);
	});

	it('returns ok:true with matches:0 and the snapshot shape when a query has no matches', async () => {
		const handler = await registerToolHandler();
		const result = parseTextResult(
			await handler({ query: 'zzz-no-match' }),
		);

		expect(result.ok).toBe(true);
		expect(result.matches).toBe(0);
		expect(result.tools).toEqual([]);
		expect(result.skills).toEqual([]);
		expect(result.proposals).toEqual([]);
		expect(result.counts).toEqual({ tools: 2, skills: 2, proposals: 2 });
	});

	it('stays pure across calls even if the first returned arrays are mutated', async () => {
		const first = buildCatalog(sources, {
			mode: 'full',
			now: fixedNow,
			server,
		});
		const mutatedTools = first.tools as IToolSummary[];
		const mutatedSkills = first.skills as ISkillSummary[];
		const mutatedProposals = first.proposals as IProposalSummary[];
		mutatedTools[0] = { name: 'broken', plugin: 'broken' };
		mutatedSkills[0] = {
			id: 'broken',
			version: '0.0.0',
			minCoreVersion: '0.0.0',
			summary: 'broken',
			appliesTo: ['@mcp-vertex/*'],
			tags: [],
			bodyPath: 'broken',
		};
		mutatedProposals[0] = {
			id: 'broken',
			title: 'broken',
			track: 'broken',
			status: 'done',
			kind: 'audit',
			date: 'broken',
		};

		const second = buildCatalog(sources, {
			mode: 'full',
			now: fixedNow,
			server,
		});

		expect(second.tools.map((entry) => entry.name)).toContain(
			'mcp-vertex_agent_catalog',
		);
		expect(second.skills.map((entry) => entry.id)).toContain(
			'mcp-vertex-audit-playbook',
		);
		expect(second.proposals.map((entry) => entry.id)).toContain('a00001');
	});
});
