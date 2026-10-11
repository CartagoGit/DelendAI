import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { buildRoadmapPlanInitTool } from '../../../../src/lib/tools/plan-init.tool';
import { buildRoadmapShowTool } from '../../../../src/lib/tools/show.tool';
import { openRoadmapWorkspace } from '../../../../src/lib/workspace/roadmap-workspace.service';
import { entry, horizon, roadmapOf } from '../read-model/read-model.fixture';
import {
	call,
	cleanProjects,
	codeOf,
	reasonOf,
	roadmapProject,
} from './tools.fixture';

afterEach(cleanProjects);

describe('roadmap_plan_init', () => {
	it('creates the file on first use and records who, when and why', async () => {
		const project = roadmapProject();
		const tool = buildRoadmapPlanInitTool(project.options);
		expect(tool.effects).toEqual(['write']);
		expect(tool.writeRoot).toBe('caller-checkout');
		const answer = await call(tool, {
			version: '1.0.0',
			bumpHint: 'minor',
			reason: 'what 1.0 promises',
			actor: 'ana',
			entries: [entry('a', 'committed')],
		});
		expect(answer.body).toEqual({
			ok: true,
			file: 'ROADMAP.yaml',
			version: '1.0.0',
			entries: 1,
			recorded: 2,
		});
		const timeline = readFileSync(
			join(project.root, 'ROADMAP.timeline.md'),
			'utf8',
		);
		expect(timeline).toContain('"actor":"ana"');
		expect(timeline).toContain('"at":"2026-10-11T00:00:00.000Z"');
		expect(timeline).toContain('"reason":"what 1.0 promises"');
		const shown = await call(buildRoadmapShowTool(project.options));
		expect(
			(shown.body.horizons as { version: string }[]).map(
				(h) => h.version,
			),
		).toEqual(['1.0.0']);
	});

	it('refuses a version that already has a horizon, and writes nothing', async () => {
		const project = roadmapProject(
			roadmapOf(horizon('1.0.0', [entry('a', 'committed')])),
		);
		const before = readFileSync(join(project.root, 'ROADMAP.yaml'), 'utf8');
		const answer = await call(buildRoadmapPlanInitTool(project.options), {
			version: '1.0.0',
			reason: 'again',
		});
		expect(codeOf(answer)).toBe('plan-init-refused');
		expect(reasonOf(answer)).toContain('already has a horizon 1.0.0');
		expect(readFileSync(join(project.root, 'ROADMAP.yaml'), 'utf8')).toBe(
			before,
		);
	});

	it('needs a reason and a well-formed entry', async () => {
		const project = roadmapProject();
		const tool = buildRoadmapPlanInitTool(project.options);
		expect(codeOf(await call(tool, { version: '1.0.0' }))).toBe(
			'invalid-arguments',
		);
		expect(
			codeOf(
				await call(tool, {
					version: '1.0.0',
					reason: 'r',
					entries: [{ id: 'a' }],
				}),
			),
		).toBe('invalid-arguments');
	});
});

describe('where the roadmap may live', () => {
	it('refuses a roadmap file outside the workspace', () => {
		const opened = openRoadmapWorkspace({
			workspaceRoot: '/repo',
			options: { file: '../elsewhere/ROADMAP.md' },
		});
		expect(opened.ok).toBe(false);
		if (opened.ok) return;
		expect(opened.reason).toContain('outside the workspace');
	});

	it('refuses a timeline file outside the workspace', () => {
		const opened = openRoadmapWorkspace({
			workspaceRoot: '/repo',
			options: { file: 'ROADMAP.md', timeline: '../../t.md' },
		});
		expect(opened.ok).toBe(false);
	});
});
