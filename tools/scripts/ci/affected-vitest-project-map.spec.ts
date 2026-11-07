import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { buildGraph, resolveVitestProjectName } from './affected.script';
import rootVitestConfig from '../../../vitest.config';

const here = dirname(fileURLToPath(import.meta.url));
const workspaceRoot = resolve(here, '../../..');
const vitestConfigNames = [
	'vitest.config.ts',
	'vitest.config.mts',
	'vitest.config.js',
	'vitest.config.mjs',
] as const;

const rootProjectPatterns = (() => {
	const projects = rootVitestConfig.test?.projects;
	return Array.isArray(projects)
		? projects.filter((value): value is string => typeof value === 'string')
		: [];
})();

const matchesRootProjectPattern = (
	workspaceDir: string,
	pattern: string,
): boolean => {
	if (pattern.endsWith('/*')) {
		const prefix = pattern.slice(0, -2);
		if (!workspaceDir.startsWith(`${prefix}/`)) return false;
		return !workspaceDir.slice(prefix.length + 1).includes('/');
	}

	return workspaceDir === pattern;
};

const hasVitestConfig = (workspaceDir: string): boolean =>
	vitestConfigNames.some((configName) =>
		existsSync(join(workspaceRoot, workspaceDir, configName)),
	);

describe('affected.script workspace Vitest project map', () => {
	it('resolves every real workspace to a Vitest project accepted by the monorepo config', () => {
		const graph = buildGraph(workspaceRoot);
		const realVitestWorkspaceDirs = [...graph.dirToName.entries()]
			.filter(
				([dir]) =>
					rootProjectPatterns.some((pattern) =>
						matchesRootProjectPattern(dir, pattern),
					) && hasVitestConfig(dir),
			)
			.map(([dir]) => dir)
			.sort();
		const resolvedProjects = realVitestWorkspaceDirs.map((dir) => {
			const pkgName = graph.dirToName.get(dir);
			if (pkgName === undefined) {
				throw new Error(
					`Workspace ${dir} is missing from the package graph.`,
				);
			}

			return {
				dir,
				pkgName,
				vitestProject: resolveVitestProjectName(
					join(workspaceRoot, dir),
					pkgName,
				),
			};
		});

		expect(realVitestWorkspaceDirs.length).toBeGreaterThan(0);

		for (const { dir, pkgName, vitestProject } of resolvedProjects) {
			expect(
				vitestProject.length,
				`${dir} should resolve a non-empty Vitest project name.`,
			).toBeGreaterThan(0);
			if (pkgName === '@delendai/core')
				expect(vitestProject).toBe('core');
			if (pkgName === '@delendai/git') expect(vitestProject).toBe('git');
			if (pkgName === '@delendai/cli')
				expect(vitestProject).toBe(pkgName);
		}

		expect(
			new Set(resolvedProjects.map(({ vitestProject }) => vitestProject))
				.size,
		).toBeGreaterThan(0);
	});
});
