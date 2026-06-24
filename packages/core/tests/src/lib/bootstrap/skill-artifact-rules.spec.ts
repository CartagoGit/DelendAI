// skill-artifact-rules.spec.ts: pin the SOLID skill-artifact table.

import { describe, expect, it } from 'vitest';

import { analyzeProject } from '@mcp-vertex/core/lib/bootstrap/analyze-project';
import type { IFileReader } from '@mcp-vertex/core/lib/bootstrap/analyze-project';
import { buildServerBlueprint } from '@mcp-vertex/core/lib/bootstrap/build-blueprint';
import {
	DEFAULT_SKILL_ARTIFACT_RULES,
	matchSkillArtifacts,
} from '@mcp-vertex/core/lib/bootstrap/skill-artifact-rules';
import type { ISkillArtifactContext } from '@mcp-vertex/core/lib/bootstrap/skill-artifact-rules';

const reader = (files: Record<string, string>): IFileReader => ({
	readFile: async (p) => files[p],
	exists: async (p) => p in files,
	listDir: async (p) => (p in files ? ['exists'] : []),
});

const makeAnalysis = (deps: Record<string, string> = {}) =>
	analyzeProject(
		reader({
			'tsconfig.json': '{}',
			'package.json': JSON.stringify({
				name: 'svc',
				dependencies: deps,
			}),
		}),
	);

const makeCtx = async (
	overrides: Partial<{
		analysis: Awaited<ReturnType<typeof makeAnalysis>>;
		serverName: string;
	}> = {},
): Promise<ISkillArtifactContext> => ({
	analysis: overrides.analysis ?? (await makeAnalysis()),
	serverName: overrides.serverName ?? 'mcp-project-svc',
});

describe('DEFAULT_SKILL_ARTIFACT_RULES (declarative table)', async () => {
	it('lists the two built-in skills', async () => {
		const ids = DEFAULT_SKILL_ARTIFACT_RULES.map((r) => r.id);
		expect(ids).toEqual(['project-standards', 'framework-conventions']);
	});
});

describe('matchSkillArtifacts', async () => {
	it('always emits `project standards`', async () => {
		const out = matchSkillArtifacts(await makeCtx());
		expect(out[0]?.name).toBe('project standards');
	});
	it('emits the framework-conventions skill when a framework is detected', async () => {
		const a = makeAnalysis({ react: '^18' });
		const out = matchSkillArtifacts(await makeCtx({ analysis: await a }));
		expect(out.map((s) => s.name)).toContain('react conventions');
	});
	it('does NOT emit framework-conventions when no framework is detected', async () => {
		const out = matchSkillArtifacts(await makeCtx());
		expect(out.map((s) => s.name)).toEqual(['project standards']);
	});
	it('formats the framework-skill name lazily with the framework id', async () => {
		const a = makeAnalysis({ '@angular/core': '^22' });
		const out = matchSkillArtifacts(await makeCtx({ analysis: await a }));
		const fwSkill = out.find((s) => s.name.endsWith('conventions'));
		expect(fwSkill?.name).toBe('angular conventions');
		expect(fwSkill?.description).toContain('angular');
	});
	it('emits skills in priority order (project-standards > framework-conventions)', async () => {
		const a = makeAnalysis({ react: '^18' });
		const out = matchSkillArtifacts(await makeCtx({ analysis: await a }));
		expect(out[0]?.name).toBe('project standards');
		expect(out[1]?.name).toBe('react conventions');
	});
	it('emits the `whenToUse` lines for the project-standards skill', async () => {
		const out = matchSkillArtifacts(await makeCtx());
		expect(out[0]?.whenToUse).toContain(
			'Before writing or reviewing code in this project.',
		);
	});
	it('emits the `whenToUse` lines for the framework-conventions skill', async () => {
		const a = makeAnalysis({ react: '^18' });
		const out = matchSkillArtifacts(await makeCtx({ analysis: await a }));
		const fw = out.find((s) => s.name.endsWith('conventions'));
		expect(fw?.whenToUse?.[0]).toContain('react');
	});
});

describe('integration: buildServerBlueprint uses the rule table', async () => {
	it('produces the same skills as the pre-refactor inline builder', async () => {
		// The pre-refactor builder produced:
		//   - project standards (always)
		//   - `<framework> conventions` (when framework detected)
		const a = makeAnalysis({ react: '^18' });
		const bp = buildServerBlueprint(await a);
		expect(bp.skills.map((s) => s.name)).toEqual([
			'project standards',
			'react conventions',
		]);
	});
});
