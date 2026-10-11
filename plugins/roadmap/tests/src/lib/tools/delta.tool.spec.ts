/**
 * delta.tool.spec.ts — the envelope of `roadmap_delta` is a contract: the
 * web page and the editor view read it.
 */
import { afterEach, describe, expect, it } from 'vitest';

import { ROADMAP_BUMP_AUTHORITY } from '../../../../src/lib/contracts/constants/bump-intent.constant';
import { buildRoadmapDeltaTool } from '../../../../src/lib/tools/delta.tool';
import { entry, horizon, roadmapOf } from '../read-model/read-model.fixture';
import { call, cleanProjects, codeOf, roadmapProject } from './tools.fixture';

afterEach(cleanProjects);

const roadmap = roadmapOf(
	horizon(
		'0.5.0',
		[
			entry('a', 'delivered', [{ kind: 'path-exists', target: 'a.ts' }]),
			entry('b', 'in-progress'),
			entry('c', 'dropped'),
		],
		'minor',
	),
	horizon('0.6.0', [entry('d', 'proposed', [], 'fix')]),
);

describe('roadmap_delta', () => {
	it('returns exactly the three columns, the bump and the next action', async () => {
		const project = roadmapProject(roadmap, {
			versionFile: 'package.json',
		});
		project.write('a.ts', 'export {};\n');
		project.write('package.json', '{"version":"0.4.2"}\n');
		const answer = await call(buildRoadmapDeltaTool(project.options), {
			version: '0.5.0',
		});
		expect(answer.isError).toBe(false);
		expect(answer.body).toEqual({
			ok: true,
			horizons: [
				{
					version: '0.5.0',
					declared: ['a', 'b'],
					delivered: ['a'],
					published: false,
					bump: {
						kind: 'minor',
						authority: ROADMAP_BUMP_AUTHORITY,
						declared: 'minor',
						coherent: true,
					},
					nextAction: 'deliver, or withdraw with a reason: b',
				},
			],
		});
	});

	it('says published once the project version reaches the horizon', async () => {
		const project = roadmapProject(roadmap, {
			versionFile: 'package.json',
		});
		project.write('package.json', '{"version":"0.5.1"}\n');
		const answer = await call(buildRoadmapDeltaTool(project.options));
		const horizons = answer.body.horizons as { published: boolean }[];
		expect(horizons.map((each) => each.published)).toEqual([true, false]);
	});

	it('says null, not false, when nobody can say what is published', async () => {
		const withoutFile = roadmapProject(roadmap);
		const first = await call(buildRoadmapDeltaTool(withoutFile.options));
		expect(
			(first.body.horizons as { published: unknown }[])[0]?.published,
		).toBeNull();
		const unreadable = roadmapProject(roadmap, {
			versionFile: 'package.json',
		});
		unreadable.write('package.json', '{not json');
		const second = await call(buildRoadmapDeltaTool(unreadable.options));
		expect(
			(second.body.horizons as { published: unknown }[])[0]?.published,
		).toBeNull();
	});

	it('declares an output schema and refuses what it was not asked', async () => {
		const project = roadmapProject(roadmap);
		const tool = buildRoadmapDeltaTool(project.options);
		expect((await call(tool)).outputSchema).toBeDefined();
		expect(codeOf(await call(tool, { version: '7.0.0' }))).toBe(
			'unknown-version',
		);
		expect(codeOf(await call(tool, { versions: [] }))).toBe(
			'invalid-arguments',
		);
	});
});
