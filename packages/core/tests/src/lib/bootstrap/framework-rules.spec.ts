// framework-rules.spec.ts: pin the SOLID framework rule table.

import { describe, expect, it } from 'vitest';

import { analyzeProject } from '@mcp-vertex/core/lib/bootstrap/analyze-project';
import type { IFileReader } from '@mcp-vertex/core/lib/bootstrap/analyze-project';
import {
	DEFAULT_FRAMEWORK_RULES,
	GAME_ENGINE_DEPS,
	isGameProject,
	matchFramework,
} from '@mcp-vertex/core/lib/bootstrap/framework-rules';

const reader = (files: Record<string, string>): IFileReader => ({
	readFile: (p) => files[p],
	exists: (p) => p in files,
	listDir: () => [],
});

describe('DEFAULT_FRAMEWORK_RULES (declarative table)', () => {
	it('lists the six built-in frameworks', () => {
		const ids = DEFAULT_FRAMEWORK_RULES.map((r) => r.id);
		expect(ids).toEqual([
			'angular',
			'next',
			'react',
			'vue',
			'svelte',
			'solid',
		]);
	});
	it('angular has the highest priority (Angular always wins when present)', () => {
		const angular = DEFAULT_FRAMEWORK_RULES.find((r) => r.id === 'angular');
		const react = DEFAULT_FRAMEWORK_RULES.find((r) => r.id === 'react');
		expect(angular?.priority).toBeGreaterThan(react?.priority ?? 0);
	});
});

describe('matchFramework', () => {
	it('returns the framework id when a dep matches', () => {
		expect(matchFramework({ '@angular/core': '^22' })).toBe('angular');
		expect(matchFramework({ react: '^18' })).toBe('react');
	});
	it('returns undefined when no framework dep is present', () => {
		expect(matchFramework({ lodash: '^4' })).toBeUndefined();
	});
	it('respects priority (angular > react)', () => {
		expect(matchFramework({ '@angular/core': '^22', react: '^18' })).toBe(
			'angular',
		);
	});
	it('a custom rule table overrides the default', () => {
		// Host injects a higher-priority rule for `solid` so the
		// custom table's priority wins over the default's.
		expect(
			matchFramework({ 'solid-js': '^1' }, [
				{ id: 'solid', depName: 'solid-js', priority: 100 },
				{ id: 'react', depName: 'react', priority: 50 },
			]),
		).toBe('solid');
	});
});

describe('GAME_ENGINE_DEPS / isGameProject', () => {
	it('lists the four built-in game engines', () => {
		expect(GAME_ENGINE_DEPS).toEqual([
			'phaser',
			'three',
			'pixi.js',
			'babylonjs',
		]);
	});
	it('returns true when any engine dep is present', () => {
		expect(isGameProject({ phaser: '^3' })).toBe(true);
		expect(isGameProject({ three: '^0.150' })).toBe(true);
	});
	it('returns false for non-game projects', () => {
		expect(isGameProject({ react: '^18' })).toBe(false);
	});
});

describe('integration: detectFramework uses the rule table', () => {
	it('still classifies a React project correctly', () => {
		const analysis = analyzeProject(
			reader({
				'package.json': JSON.stringify({
					name: 'app',
					dependencies: { react: '^18' },
				}),
				'tsconfig.json': '{}',
			}),
		);
		expect(analysis.framework).toBe('react');
	});
});
