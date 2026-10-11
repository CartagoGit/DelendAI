import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
	OptimizeRunOutputSchema,
	runOptimizeRun,
} from '../../src/public/index';

const createdRoots: string[] = [];

const makeWorkspace = async (): Promise<string> => {
	const root = await mkdtemp(join(tmpdir(), 'adaptive-optimizer-'));
	createdRoots.push(root);
	await mkdir(join(root, 'docs'), { recursive: true });
	await mkdir(join(root, 'packages/cli'), { recursive: true });
	await writeFile(
		join(root, 'delendai.config.json'),
		'{"plugins":{}}\n',
		'utf8',
	);
	await writeFile(join(root, 'package.json'), '{"name":"demo"}\n', 'utf8');
	return root;
};

afterEach(async () => {
	for (const root of createdRoots.splice(0)) {
		await rm(root, { recursive: true, force: true });
	}
});

describe('optimize_run', () => {
	it('returns an error when consent is false', async () => {
		const root = await makeWorkspace();
		const result = await runOptimizeRun(
			{
				candidates: [{ id: 'candidate-a' }],
				budget: 10,
				consent: false,
			},
			{
				namespacePrefix: 'delendai',
				workspaceRootAbs: root,
				maxBytes: 2000,
				discoverRosterFn: async () => ({ available: [], missing: [] }),
			},
		);

		expect(result.isError).toBe(true);
		expect(result.structuredContent?.error).toMatchObject({
			reason: expect.stringContaining('consent=true'),
		});
	});

	it('returns an error when budget is zero', async () => {
		const root = await makeWorkspace();
		const result = await runOptimizeRun(
			{
				candidates: [{ id: 'candidate-a' }],
				budget: 0,
				consent: true,
			},
			{
				namespacePrefix: 'delendai',
				workspaceRootAbs: root,
				maxBytes: 2000,
				discoverRosterFn: async () => ({ available: [], missing: [] }),
			},
		);

		expect(result.isError).toBe(true);
		expect(result.structuredContent?.error).toMatchObject({
			reason: expect.stringContaining('budget'),
		});
	});

	it('ranks candidates by descending score when consent and budget are valid', async () => {
		const root = await makeWorkspace();
		const result = await runOptimizeRun(
			{
				task: 'optimize the cli prompt for typescript plugin orchestration',
				candidates: [
					{
						id: 'high-confidence',
						model: 'cheap-cli',
						pluginSet: ['auto-plugin-selector', 'usage-tracking'],
						prompt: 'typescript cli orchestration prompt',
						signals: {
							successRate: 0.91,
							tokenCost: 200,
							latencyMs: 180,
							relevance: 0.94,
							confidence: 0.92,
						},
					},
					{
						id: 'penalized',
						model: 'expensive-api',
						pluginSet: ['auto-plugin-selector'],
						prompt: 'generic prompt',
						permissions: ['secrets'],
						signals: {
							successRate: 0.7,
							tokenCost: 3600,
							latencyMs: 2600,
							relevance: 0.55,
							confidence: 0.5,
						},
					},
				],
				budget: 25,
				consent: true,
			},
			{
				namespacePrefix: 'delendai',
				workspaceRootAbs: root,
				maxBytes: 2000,
				hostName: 'GitHub Copilot Chat',
				discoverRosterFn: async () => ({
					available: [
						{
							id: 'cheap-cli',
							label: 'Cheap CLI',
							source: 'cli',
							vendor: 'demo',
							reach: 'cheap',
							costTier: 1,
						},
						{
							id: 'expensive-api',
							label: 'Expensive API',
							source: 'api',
							vendor: 'demo',
							reach: 'API_KEY',
							costTier: 5,
						},
					],
					missing: [],
				}),
			},
		);

		expect(result.isError).toBeUndefined();
		const output = OptimizeRunOutputSchema.parse(result.structuredContent);
		expect(output.consent).toBe(true);
		expect(output.budget).toBe(25);
		expect(output.ranked).toHaveLength(2);
		expect(output.ranked[0]?.id).toBe('high-confidence');
		expect(output.ranked[0]!.score).toBeGreaterThan(
			output.ranked[1]!.score,
		);
		expect(Number.isFinite(output.bytes)).toBe(true);
	});
});
