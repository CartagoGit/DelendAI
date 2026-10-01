#!/usr/bin/env bun
/**
 * test-zones-cover-projects.script.spec.ts
 *
 * The case that matters is the one the real configuration got wrong:
 * a zone path naming the directory ABOVE a project's root selects
 * nothing from that project, because vitest matches a positional filter
 * against a path the project can see.
 */
import { describe, expect, it } from 'vitest';

import type { IZoneRule } from '../ci/test-zones.interface.ts';

import {
	coverageOfProjects,
	formatReport,
	vitestProjectDirs,
	zonePathSelects,
} from './test-zones-cover-projects.script.ts';

describe('zonePathSelects', () => {
	it('selects a project the filter names exactly', () => {
		expect(zonePathSelects('tests/e2e', 'tests/e2e')).toBe(true);
	});

	it('selects a project when the filter names a path inside it', () => {
		expect(zonePathSelects('tools/scripts', 'tools')).toBe(true);
	});

	it('does NOT select a project from the directory above its root', () => {
		// This is the whole bug: `tests` reached nothing in `tests/e2e`,
		// and `docs` reached the `docs` plugin instead of the example
		// project under `docs/delendai/examples/`.
		expect(zonePathSelects('tests', 'tests/e2e')).toBe(false);
		expect(
			zonePathSelects('docs', 'docs/delendai/examples/custom-plugin'),
		).toBe(false);
	});

	it('does not select a sibling whose name starts the same way', () => {
		expect(zonePathSelects('packages/core-extra', 'packages/core')).toBe(
			false,
		);
	});
});

describe('coverageOfProjects', () => {
	const rules: readonly IZoneRule[] = [
		{ id: 'core', match: () => false, paths: () => ['packages/core'] },
		{
			id: 'tools',
			match: () => true,
			paths: () => ['tools', 'tests'],
		},
	];

	it('names the zone that selects each project', () => {
		expect(
			coverageOfProjects(['packages/core', 'tools'], [], rules),
		).toEqual([
			{ project: 'packages/core', zone: 'core' },
			{ project: 'tools', zone: 'tools' },
		]);
	});

	it('leaves a project no zone reaches without one', () => {
		expect(coverageOfProjects(['tests/e2e'], [], rules)).toEqual([
			{ project: 'tests/e2e', zone: undefined },
		]);
	});
});

describe('formatReport', () => {
	it('says how many projects it checked when every one is covered', () => {
		expect(formatReport([{ project: 'tools', zone: 'tools' }])).toContain(
			'1 vitest project(s)',
		);
	});

	it('names the projects nothing runs, and says what to do', () => {
		const report = formatReport([
			{ project: 'tests/e2e', zone: undefined },
			{ project: 'tools', zone: 'tools' },
		]);

		expect(report).toContain('tests/e2e');
		expect(report).not.toContain('\n  tools\n');
		expect(report).toContain('does not run in CI');
	});
});

describe('vitestProjectDirs', () => {
	it('finds a project by its config and never counts the root itself', () => {
		const tree: Record<string, readonly string[]> = {
			'/repo': ['vitest.config.ts', 'packages/', 'tests/'],
			'/repo/packages': ['core/'],
			'/repo/packages/core': ['vitest.config.ts', 'src/'],
			'/repo/packages/core/src': [],
			'/repo/tests': ['e2e/'],
			'/repo/tests/e2e': ['vitest.config.ts'],
		};

		expect(vitestProjectDirs('/repo', (dir) => tree[dir] ?? [])).toEqual([
			'packages/core',
			'tests/e2e',
		]);
	});
});
