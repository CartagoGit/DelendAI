import { describe, expect, it } from 'vitest';

import {
	analyzeProject,
	type IFileReader,
} from '@delendai/core/lib/bootstrap/analyze-project';
import {
	buildCapabilityGraph,
	projectLegacyProjectType,
} from '@delendai/core/lib/config/capability-graph.service';

const reader = (files: Readonly<Record<string, string>>): IFileReader => ({
	readFile: async (path) => files[path],
	exists: async (path) => Object.hasOwn(files, path),
	listDir: async (path) => {
		const prefix = path === '' || path === '.' ? '' : `${path}/`;
		return [
			...new Set(
				Object.keys(files)
					.filter((file) => file.startsWith(prefix))
					.map((file) => file.slice(prefix.length).split('/')[0])
					.filter((entry): entry is string => entry !== undefined),
			),
		];
	},
});

describe('canonical capability graph', () => {
	it('retains every language and makes analyzeProject a derived projection', async () => {
		const projectReader = reader({
			'package.json': JSON.stringify({
				name: 'polyglot-api',
				dependencies: { fastify: '^5' },
			}),
			'tsconfig.json': '{}',
			'Cargo.toml': '[package]\nname="worker"',
			'go.mod': 'module example.com/worker',
		});
		const graph = await buildCapabilityGraph(projectReader);
		const legacy = await analyzeProject(projectReader);

		expect(graph.languages.map(({ id }) => id)).toEqual([
			'typescript',
			'go',
			'rust',
		]);
		expect(graph.languages.every(({ signals }) => signals.length > 0)).toBe(
			true,
		);
		expect(legacy.language).toBe(graph.primaryLanguage);
		expect(legacy.projectType).toBe(projectLegacyProjectType(graph));
		expect(legacy.projectType).toBe('webapp');
	});

	it('keeps monorepo form independent from all detected roles', async () => {
		const projectReader = reader({
			'package.json': JSON.stringify({
				workspaces: ['packages/*'],
				main: './dist/index.js',
				dependencies: { react: '^18', fastify: '^5' },
			}),
		});
		const graph = await buildCapabilityGraph(projectReader);
		const legacy = await analyzeProject(projectReader);

		expect(graph.shape.workspace).toBe('monorepo');
		expect(graph.shape.roles.map(({ role }) => role)).toEqual(
			expect.arrayContaining(['web-client', 'backend-api', 'library']),
		);
		expect(legacy.projectType).toBe('monorepo');
	});

	it('returns an honest empty graph and compatible generic projection', async () => {
		const projectReader = reader({});
		const graph = await buildCapabilityGraph(projectReader);
		const legacy = await analyzeProject(projectReader);

		expect(graph.languages).toEqual([]);
		expect(graph.primaryLanguage).toBeUndefined();
		expect(graph.shape.roles).toEqual([]);
		expect(legacy.language).toBe('unknown');
		expect(legacy.projectType).toBe('generic');
	});
});
