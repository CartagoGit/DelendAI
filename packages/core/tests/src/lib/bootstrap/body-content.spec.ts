// body-content.spec.ts: the SOLID body builders are unit-testable
// in isolation and the dispatcher routes by artifact name.

import { describe, expect, it } from 'vitest';

import { analyzeProject } from '@mcp-vertex/core/lib/bootstrap/analyze-project';
import type { IFileReader } from '@mcp-vertex/core/lib/bootstrap/analyze-project';
import {
	blueprintArtifactBody,
	fixQualityPromptBody,
	formatList,
	formatScripts,
	frameworkHintsFor,
	frameworkSkillBody,
	frameworkSkillWhenToUse,
	languageHintsFor,
	projectStandardsSkillBody,
	startPromptBody,
} from '@mcp-vertex/core/lib/bootstrap/body-content';
import { buildServerBlueprint } from '@mcp-vertex/core/lib/bootstrap/build-blueprint';

const reader = (files: Record<string, string>): IFileReader => ({
	readFile: (p) => files[p],
	exists: (p) => p in files,
	listDir: () => [],
});

const analyse = (pkg: Record<string, unknown>) =>
	analyzeProject(
		reader({
			'package.json': JSON.stringify({
				name: '@acme/site',
				...pkg,
			}),
			'tsconfig.json': '{}',
		}),
	);

describe('format-helpers', () => {
	it('formatList renders empty as a stub', () => {
		expect(formatList([])).toBe('_(none detected)_');
	});
	it('formatList renders each item as a backticked bullet', () => {
		expect(formatList(['a', 'b'])).toBe('- `a`\n- `b`');
	});
	it('formatScripts renders empty as a stub', () => {
		expect(formatScripts({})).toBe('_(no quality scripts detected)_');
	});
	it('formatScripts renders role → command bullets', () => {
		expect(formatScripts({ test: 'vitest', lint: 'eslint .' })).toBe(
			'- `test` → `vitest`\n- `lint` → `eslint .`',
		);
	});
});

describe('framework-hints / language-hints (declarative tables)', () => {
	it('returns the registered hints for Angular', () => {
		const a = analyse({ dependencies: { '@angular/core': '^22' } });
		const hints = frameworkHintsFor(a);
		expect(hints.length).toBeGreaterThan(0);
		expect(hints[0]).toMatch(/Standalone components/);
	});
	it('returns the empty fallback for an unknown framework', () => {
		const a = analyse({});
		expect(frameworkHintsFor(a)).toEqual([]);
	});
	it('returns the empty fallback for an unknown language', () => {
		// A reader with no tsconfig AND no package.json field makes the
		// analyzer default to `unknown` language.
		const a = analyzeProject(reader({}));
		expect(a.language).toBe('unknown');
		expect(languageHintsFor(a)).toEqual([]);
	});
});

describe('prompt bodies', () => {
	it('startPromptBody includes project facts and bootstrap references', () => {
		const a = analyse({
			dependencies: { '@angular/core': '^22' },
			scripts: { lint: 'eslint .', test: 'vitest' },
		});
		const body = startPromptBody(a, 'acme');
		expect(body).toContain('@acme/site');
		expect(body).toContain('acme_overview');
		expect(body).toContain('angular');
	});

	it('fixQualityPromptBody is honest when there are no scripts', () => {
		const a = analyse({});
		expect(fixQualityPromptBody(a, 'acme')).toMatch(
			/no quality scripts detected/i,
		);
	});
});

describe('skill bodies', () => {
	it('projectStandardsSkillBody lists CI and agent configs', () => {
		const a = analyzeProject(
			reader({
				'package.json': '{"name":"x"}',
				'tsconfig.json': '{}',
				'AGENTS.md': '# guide',
				'.github/copilot-instructions.md': '# guide',
				'.gitlab-ci.yml': 'stages: [test]',
			}),
		);
		const body = projectStandardsSkillBody(a);
		expect(body).toContain('AGENTS.md');
		expect(body).toContain('gitlab-ci');
	});

	it('frameworkSkillBody is empty for projects without a framework', () => {
		const a = analyse({});
		expect(frameworkSkillBody(a)).toBe('');
		expect(frameworkSkillWhenToUse(a)).toEqual([]);
	});
});

describe('blueprintArtifactBody dispatcher', () => {
	it('routes `start` to startPromptBody', () => {
		const a = analyse({});
		const out = blueprintArtifactBody(
			{ name: 'start', description: 'd' },
			a,
			'acme',
		);
		expect(out).toBe(startPromptBody(a, 'acme'));
	});
	it('routes `fix quality` to fixQualityPromptBody', () => {
		const a = analyse({});
		const out = blueprintArtifactBody(
			{ name: 'fix quality', description: 'd' },
			a,
			'acme',
		);
		expect(out).toBe(fixQualityPromptBody(a, 'acme'));
	});
	it('returns empty string for unknown artefact names', () => {
		const a = analyse({});
		expect(
			blueprintArtifactBody(
				{ name: 'totally unknown', description: 'd' },
				a,
				'acme',
			),
		).toBe('');
	});
	it('the dispatcher is referenced by the blueprint pipeline (regression guard)', () => {
		const a = analyse({});
		const bp = buildServerBlueprint(a);
		const start = bp.prompts.find((p) => p.name === 'start');
		expect(start?.body).toBe(startPromptBody(a, bp.namespacePrefix));
	});
});
