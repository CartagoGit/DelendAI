import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { buildRoadmapPromotionTool } from '../../../../src/lib/tools/promotion.tool';
import { entry, horizon, roadmapOf } from '../read-model/read-model.fixture';
import { call, cleanProjects, codeOf, roadmapProject } from './tools.fixture';

afterEach(cleanProjects);

const roadmap = roadmapOf(
	horizon('1.0.0', [entry('a', 'delivered')]),
	horizon('1.1.0', [
		entry('b', 'delivered', [{ kind: 'path-exists', target: 'b.ts' }]),
	]),
	horizon('1.2.0', [entry('c', 'committed')]),
);

describe('roadmap_promotion', () => {
	it('names the project branches and what to do, and executes nothing', async () => {
		const project = await roadmapProject(roadmap, {
			versionFile: 'package.json',
		});
		project.write('package.json', '{"version":"1.0.0"}\n');
		project.write('b.ts', 'export {};\n');
		const tool = buildRoadmapPromotionTool(project.options);
		expect(tool.effects).toBeUndefined();
		const before = readFileSync(join(project.root, 'ROADMAP.yaml'), 'utf8');
		const answer = await call(tool);
		expect(answer.body).toMatchObject({
			ok: true,
			from: 'trunk',
			to: 'release/2.x',
			promotable: true,
			readiness: { version: '1.1.0', status: 'ready' },
		});
		expect(String(answer.body.nextAction)).toMatch(
			/^open the pull request from trunk into release\/2\.x: /u,
		);
		expect(readFileSync(join(project.root, 'ROADMAP.yaml'), 'utf8')).toBe(
			before,
		);
	});

	it('says what holds a version back', async () => {
		const project = await roadmapProject(roadmap);
		const answer = await call(buildRoadmapPromotionTool(project.options), {
			version: '1.2.0',
		});
		expect(answer.body.readiness).toMatchObject({ status: 'not-ready' });
		expect(String(answer.body.nextAction)).toMatch(
			/^do not promote 1\.2\.0 yet: /u,
		);
	});

	it('has nothing to promote in a project with one branch', async () => {
		const project = await roadmapProject(
			roadmap,
			{},
			{ integration: 'main', release: 'main' },
		);
		const answer = await call(buildRoadmapPromotionTool(project.options));
		expect(answer.body.promotable).toBe(false);
		expect(answer.body.readiness).toBeUndefined();
		expect(String(answer.body.nextAction)).toContain('on main');
	});

	it('has nothing to do once every version is published', async () => {
		const project = await roadmapProject(roadmap, {
			versionFile: 'package.json',
		});
		project.write('package.json', '{"version":"2.0.0"}\n');
		const answer = await call(buildRoadmapPromotionTool(project.options));
		expect(answer.body.nextAction).toBe(
			'nothing: every version the roadmap holds is published',
		);
	});

	it('refuses without a development policy, an unknown version or bad arguments', async () => {
		const project = await roadmapProject(roadmap);
		const tool = buildRoadmapPromotionTool(project.options);
		expect(codeOf(await call(tool, { version: '9.0.0' }))).toBe(
			'unknown-version',
		);
		expect(codeOf(await call(tool, { v: 1 }))).toBe('invalid-arguments');
		const { branches: _none, ...withoutPolicy } = project.options;
		expect(
			codeOf(await call(buildRoadmapPromotionTool(withoutPolicy))),
		).toBe('no-branches');
	});
});
