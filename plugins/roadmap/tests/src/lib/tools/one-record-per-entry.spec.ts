/**
 * one-record-per-entry.spec.ts — closing touches only the entry asked
 * for, a change the timeline cannot record is rolled back, and a proposal
 * archived under legacy/closed counts as delivered.
 */
import { afterEach, describe, expect, it } from 'vitest';

import { buildRoadmapPlanCloseTool } from '../../../../src/lib/tools/plan-close.tool';
import { entry, horizon, roadmapOf } from '../read-model/read-model.fixture';
import { call, cleanProjects, roadmapProject } from './tools.fixture';

afterEach(cleanProjects);

describe('roadmap keeps one record per entry', () => {
	it('closes only the entry in the horizon it found', async () => {
		const project = await roadmapProject(
			roadmapOf(
				horizon('1.0.0', [entry('dup', 'in-progress')]),
				horizon('2.0.0', [entry('dup', 'in-progress')]),
			),
		);
		await call(buildRoadmapPlanCloseTool(project.options), {
			entry: 'dup',
			to: 'dropped',
			reason: 'not needed',
		});
		const workspace = await project.options.workspace();
		const read = await workspace.roadmap.read();
		const states = read.ok
			? read.value.horizons.map((each) => each.entries[0]?.state)
			: [];
		expect(states).toEqual(['dropped', 'in-progress']);
	});

	it('restores the roadmap when the timeline cannot record', async () => {
		const project = await roadmapProject(
			roadmapOf(horizon('1.0.0', [entry('one', 'in-progress')])),
		);
		const workspace = await project.options.workspace();
		const answer = await call(
			buildRoadmapPlanCloseTool({
				...project.options,
				workspace: () =>
					Promise.resolve({
						...workspace,
						timeline: {
							list: () => workspace.timeline.list(),
							append: async () => ({
								ok: false as const,
								reason: 'disk full',
							}),
						},
					}),
			}),
			{ entry: 'one', to: 'dropped', reason: 'no' },
		);
		expect(answer.isError).toBe(true);
		expect(JSON.stringify(answer.body)).toContain('restored');
		const read = await workspace.roadmap.read();
		expect(read.ok && read.value.horizons[0]?.entries[0]?.state).toBe(
			'in-progress',
		);
	});

	it('reads a proposal archived under legacy/closed as done', async () => {
		const project = await roadmapProject(roadmapOf(horizon('1.0.0', [])));
		project.write(
			'docs/proposals/legacy/closed/fixes/x1-old.md',
			'# old\n',
		);
		const workspace = await project.options.workspace();
		await expect(workspace.proposalStatus('x1')).resolves.toBe('done');
	});
});
