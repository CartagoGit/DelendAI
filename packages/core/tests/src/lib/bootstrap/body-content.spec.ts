import { describe, expect, it } from 'vitest';

import { analyzeProject } from '@mcp-vertex/core/lib/bootstrap/analyze-project';
import type { IFileReader } from '@mcp-vertex/core/lib/bootstrap/analyze-project';
import {
	continueProposalPromptBody,
	fixQualityPromptBody,
	frameworkSkillBody,
	frameworkSkillWhenToUse,
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

describe('body-content', () => {
	it('start prompt body includes project facts and bootstrap references', () => {
		const a = analyse({
			dependencies: { '@angular/core': '^22' },
			scripts: { lint: 'eslint .', test: 'vitest' },
		});
		const body = startPromptBody(a, 'acme');
		expect(body).toContain('@acme/site');
		expect(body).toContain('acme_overview');
		expect(body).toContain('acme_analyze_project');
		expect(body).toContain('acme_plan_mcp_project');
		expect(body).toContain('angular');
	});

	it('fix quality prompt body lists the actual scripts', () => {
		const a = analyse({
			scripts: { lint: 'eslint .', test: 'vitest', build: 'ng build' },
		});
		const body = fixQualityPromptBody(a, 'acme');
		expect(body).toContain('lint');
		expect(body).toContain('eslint .');
		expect(body).toContain('test');
		expect(body).toContain('ng build');
	});

	it('fix quality prompt body is honest when there are no scripts', () => {
		const a = analyse({});
		const body = fixQualityPromptBody(a, 'acme');
		expect(body).toMatch(/no quality scripts detected/i);
	});

	it('continue proposal prompt body references the multi-agent workflow', () => {
		const body = continueProposalPromptBody('acme');
		expect(body).toContain('acme_auto_work');
		expect(body).toContain('acme_continue_proposal');
		expect(body).toContain('lock-conflict');
	});

	it('project standards skill body lists real CI / agent configs', () => {
		const a = analyse({});
		// hand-craft a richer analysis via additional files
		const a2 = analyzeProject(
			reader({
				'package.json': '{"name":"x"}',
				'AGENTS.md': '# guide',
				'CLAUDE.md': '# guide',
				'.github/copilot-instructions.md': '# guide',
				'.gitlab-ci.yml': 'stages: [test]',
			}),
		);
		const body = projectStandardsSkillBody(a2);
		expect(body).toContain('AGENTS.md');
		expect(body).toContain('CLAUDE.md');
		expect(body).toContain('copilot-instructions');
		expect(body).toContain('gitlab-ci');
		expect(body).toContain('TypeScript');
		void a;
	});

	it('framework skill body is empty for projects without a framework', () => {
		const a = analyse({});
		expect(frameworkSkillBody(a)).toBe('');
		expect(frameworkSkillWhenToUse(a)).toEqual([]);
	});

	it('framework skill body is non-empty for Angular projects', () => {
		const a = analyse({ dependencies: { '@angular/core': '^22' } });
		const body = frameworkSkillBody(a);
		expect(body).toContain('Angular');
		expect(frameworkSkillWhenToUse(a).length).toBeGreaterThan(0);
	});
});

describe('buildServerBlueprint body injection', () => {
	it('injects a real body for the start prompt and the project standards skill', () => {
		const bp = buildServerBlueprint(
			analyse({
				dependencies: { '@angular/core': '^22' },
				scripts: { lint: 'eslint .', test: 'vitest' },
			}),
		);
		const start = bp.prompts.find((p) => p.name === 'start');
		expect(start?.body).toBeDefined();
		expect(start?.body).toContain('@acme/site');
		const skill = bp.skills.find((s) => s.name === 'project standards');
		expect(skill?.body).toBeDefined();
		expect(skill?.body).toContain('Project facts');
		expect(skill?.whenToUse?.length).toBeGreaterThan(0);
	});

	it('injects the framework skill body when the project has a framework', () => {
		const bp = buildServerBlueprint(
			analyse({ dependencies: { '@angular/core': '^22' } }),
		);
		const frameworkSkill = bp.skills.find((s) =>
			s.name.includes('angular'),
		);
		expect(frameworkSkill?.body).toBeDefined();
		expect(frameworkSkill?.whenToUse?.length).toBeGreaterThan(0);
	});
});
