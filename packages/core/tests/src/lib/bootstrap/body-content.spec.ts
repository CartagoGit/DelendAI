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
	readFile: async (p) => files[p],
	exists: async (p) => p in files,
	listDir: async () => [],
});

const analyse = async (pkg: Record<string, unknown>) =>
	await analyzeProject(
		reader({
			'package.json': JSON.stringify({
				name: '@acme/site',
				...pkg,
			}),
			'tsconfig.json': '{}',
		}),
	);

describe('format-helpers', async () => {
	it('formatList renders empty as a stub', async () => {
		expect(formatList([])).toBe('_(none detected)_');
	});
	it('formatList renders each item as a backticked bullet', async () => {
		expect(formatList(['a', 'b'])).toBe('- `a`\n- `b`');
	});
	it('formatScripts renders empty as a stub', async () => {
		expect(formatScripts({})).toBe('_(no quality scripts detected)_');
	});
	it('formatScripts renders role → command bullets', async () => {
		expect(formatScripts({ test: 'vitest', lint: 'eslint .' })).toBe(
			'- `test` → `vitest`\n- `lint` → `eslint .`',
		);
	});
});

describe('framework-hints / language-hints (declarative tables)', async () => {
	it('returns the registered hints for Angular', async () => {
		const a = analyse({ dependencies: { '@angular/core': '^22' } });
		const hints = frameworkHintsFor(await a);
		expect(hints.length).toBeGreaterThan(0);
		expect(hints[0]).toMatch(/Standalone components/);
	});
	it('returns the empty fallback for an unknown framework', async () => {
		const a = analyse({});
		expect(frameworkHintsFor(await a)).toEqual([]);
	});
	it('returns the empty fallback for an unknown language', async () => {
		// A reader with no tsconfig AND no package.json field makes the
		// analyzer default to `unknown` language.
		const a = await analyzeProject(reader({}));
		expect(a.language).toBe('unknown');
		expect(languageHintsFor(a)).toEqual([]);
	});
});

describe('prompt bodies', async () => {
	it('startPromptBody includes project facts and bootstrap references', async () => {
		const a = analyse({
			dependencies: { '@angular/core': '^22' },
			scripts: { lint: 'eslint .', test: 'vitest' },
		});
		const body = startPromptBody(await a, 'acme');
		expect(body).toContain('@acme/site');
		expect(body).toContain('acme_overview');
		expect(body).toContain('angular');
	});

	it('fixQualityPromptBody is honest when there are no scripts', async () => {
		const a = analyse({});
		expect(fixQualityPromptBody(await a, 'acme')).toMatch(
			/no quality scripts detected/i,
		);
	});
});

describe('skill bodies', async () => {
	it('projectStandardsSkillBody lists CI and agent configs', async () => {
		const a = await analyzeProject(
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

	it('frameworkSkillBody is empty for projects without a framework', async () => {
		const a = analyse({});
		expect(frameworkSkillBody(await a)).toBe('');
		expect(frameworkSkillWhenToUse(await a)).toEqual([]);
	});
});

describe('blueprintArtifactBody dispatcher', async () => {
	it('routes `start` to startPromptBody', async () => {
		const a = analyse({});
		const out = blueprintArtifactBody(
			{ name: 'start', description: 'd' },
			await a,
			'acme',
		);
		expect(out).toBe(startPromptBody(await a, 'acme'));
	});
	it('routes `fix quality` to fixQualityPromptBody', async () => {
		const a = analyse({});
		const out = blueprintArtifactBody(
			{ name: 'fix quality', description: 'd' },
			await a,
			'acme',
		);
		expect(out).toBe(fixQualityPromptBody(await a, 'acme'));
	});
	it('returns empty string for unknown artefact names', async () => {
		const a = analyse({});
		expect(
			blueprintArtifactBody(
				{ name: 'totally unknown', description: 'd' },
				await a,
				'acme',
			),
		).toBe('');
	});
	it('the dispatcher is referenced by the blueprint pipeline (regression guard)', async () => {
		const a = analyse({});
		const bp = buildServerBlueprint(await a);
		const start = bp.prompts.find((p) => p.name === 'start');
		expect(start?.body).toBe(startPromptBody(await a, bp.namespacePrefix));
	});
});
