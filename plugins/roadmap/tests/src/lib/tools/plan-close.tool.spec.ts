import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { buildRoadmapPlanCloseTool } from '../../../../src/lib/tools/plan-close.tool';
import { buildRoadmapShowTool } from '../../../../src/lib/tools/show.tool';
import { entry, horizon, roadmapOf } from '../read-model/read-model.fixture';
import {
	call,
	cleanProjects,
	codeOf,
	reasonOf,
	roadmapProject,
} from './tools.fixture';

afterEach(cleanProjects);

const roadmap = roadmapOf(
	horizon('1.0.0', [
		entry('gated', 'in-progress', [
			{ kind: 'path-exists', target: 'src/gated.ts' },
		]),
		entry('open', 'in-progress'),
		entry('done', 'delivered'),
	]),
);

const stateOf = async (
	project: Awaited<ReturnType<typeof roadmapProject>>,
	id: string,
): Promise<unknown> => {
	const shown = await call(buildRoadmapShowTool(project.options), {
		entry: id,
	});
	return (shown.body.entry as { entry: Record<string, unknown> }).entry;
};

describe('roadmap_plan_close', () => {
	it('closes as delivered on passing gates, with no reason needed', async () => {
		const project = await roadmapProject(roadmap);
		project.write('src/gated.ts', 'export {};\n');
		const tool = buildRoadmapPlanCloseTool(project.options);
		expect(tool.writeRoot).toBe('caller-checkout');
		const answer = await call(tool, { entry: 'gated', to: 'delivered' });
		expect(answer.body).toMatchObject({
			ok: true,
			entry: 'gated',
			version: '1.0.0',
			from: 'in-progress',
			to: 'delivered',
			gates: { status: 'pass' },
		});
		expect(answer.body.recorded).toBeGreaterThan(0);
		expect(await stateOf(project, 'gated')).toMatchObject({
			state: 'delivered',
		});
	});

	it('does not close as delivered on silence when a gate does not pass', async () => {
		const project = await roadmapProject(roadmap);
		const tool = buildRoadmapPlanCloseTool(project.options);
		const failing = await call(tool, { entry: 'gated', to: 'delivered' });
		expect(codeOf(failing)).toBe('reason-required');
		expect(reasonOf(failing)).toContain('fail');
		const ungated = await call(tool, { entry: 'open', to: 'delivered' });
		expect(codeOf(ungated)).toBe('reason-required');
		expect(await stateOf(project, 'gated')).toMatchObject({
			state: 'in-progress',
		});
	});

	it('closes as delivered against the gates when the reason is stated', async () => {
		const project = await roadmapProject(roadmap);
		const answer = await call(buildRoadmapPlanCloseTool(project.options), {
			entry: 'open',
			to: 'delivered',
			reason: 'shipped in 1.0.0-rc2; no gate was ever declared',
		});
		expect(answer.isError).toBe(false);
		expect(await stateOf(project, 'open')).toMatchObject({
			state: 'delivered',
			note: 'shipped in 1.0.0-rc2; no gate was ever declared',
		});
		expect(
			readFileSync(join(project.root, 'ROADMAP.timeline.md'), 'utf8'),
		).toContain('no gate was ever declared');
	});

	it('always needs the reason something will not ship as promised', async () => {
		const project = await roadmapProject(roadmap);
		const tool = buildRoadmapPlanCloseTool(project.options);
		for (const to of ['deferred', 'dropped'] as const) {
			expect(codeOf(await call(tool, { entry: 'open', to }))).toBe(
				'reason-required',
			);
		}
		const dropped = await call(tool, {
			entry: 'open',
			to: 'dropped',
			reason: 'no longer needed',
		});
		expect(dropped.body.to).toBe('dropped');
	});

	it('pairs superseded with the entry that replaces it', async () => {
		const project = await roadmapProject(roadmap);
		const tool = buildRoadmapPlanCloseTool(project.options);
		expect(
			codeOf(
				await call(tool, {
					entry: 'open',
					to: 'superseded',
					reason: 'r',
				}),
			),
		).toBe('superseded-by');
		expect(
			codeOf(
				await call(tool, {
					entry: 'open',
					to: 'dropped',
					reason: 'r',
					supersededBy: 'gated',
				}),
			),
		).toBe('superseded-by');
		const answer = await call(tool, {
			entry: 'open',
			to: 'superseded',
			reason: 'folded into gated',
			supersededBy: 'gated',
		});
		expect(answer.isError).toBe(false);
		expect(await stateOf(project, 'open')).toMatchObject({
			state: 'superseded',
			supersededBy: 'gated',
		});
	});

	it('refuses a transition the state machine does not allow', async () => {
		const project = await roadmapProject(roadmap);
		const answer = await call(buildRoadmapPlanCloseTool(project.options), {
			entry: 'done',
			to: 'dropped',
			reason: 'changed our mind',
		});
		expect(codeOf(answer)).toBe('illegal-transition');
	});

	it('names an entry it does not have and arguments it cannot read', async () => {
		const project = await roadmapProject(roadmap);
		const tool = buildRoadmapPlanCloseTool(project.options);
		expect(codeOf(await call(tool, { entry: 'zz', to: 'dropped' }))).toBe(
			'unknown-entry',
		);
		expect(
			codeOf(await call(tool, { entry: 'open', to: 'proposed' })),
		).toBe('invalid-arguments');
	});
});
