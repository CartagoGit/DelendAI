/**
 * read-tools.spec.ts — show, sync and readiness answer from the file and
 * change nothing.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { buildRoadmapPlanInitTool } from '../../../../src/lib/tools/plan-init.tool';
import { buildRoadmapReadinessTool } from '../../../../src/lib/tools/readiness.tool';
import { buildRoadmapShowTool } from '../../../../src/lib/tools/show.tool';
import { buildRoadmapSyncTool } from '../../../../src/lib/tools/sync.tool';
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
	horizon('0.5.0', [
		entry('a', 'delivered', [{ kind: 'path-exists', target: 'src/a.ts' }]),
		entry('b', 'in-progress'),
	]),
	horizon('0.6.0', [entry('c', 'proposed')]),
);

describe('roadmap_show', () => {
	it('lists every horizon compactly, without the gates', async () => {
		const project = await roadmapProject(roadmap);
		const answer = await call(buildRoadmapShowTool(project.options));
		expect(answer.name).toBe('x_roadmap_show');
		expect(answer.outputSchema).toBeDefined();
		expect(answer.body.file).toBe('ROADMAP.yaml');
		const horizons = answer.body.horizons as { entries: object[] }[];
		expect(horizons).toHaveLength(2);
		expect(horizons[0]?.entries[0]).toEqual({
			id: 'a',
			title: 'Entry a',
			kind: 'feature',
			state: 'delivered',
		});
		expect(answer.body.entry).toBeUndefined();
	});

	it('gives one entry whole on request', async () => {
		const project = await roadmapProject(roadmap);
		const answer = await call(buildRoadmapShowTool(project.options), {
			entry: 'a',
		});
		const detail = answer.body.entry as {
			version: string;
			entry: { gates: object[] };
		};
		expect(detail.version).toBe('0.5.0');
		expect(detail.entry.gates).toHaveLength(1);
	});

	it('names what it does not have', async () => {
		const project = await roadmapProject(roadmap);
		const tool = buildRoadmapShowTool(project.options);
		expect(codeOf(await call(tool, { entry: 'zz' }))).toBe('unknown-entry');
		const missing = await call(tool, { version: '9.9.9' });
		expect(codeOf(missing)).toBe('unknown-version');
		expect(missing.isError).toBe(true);
		expect(codeOf(await call(tool, { nope: 1 }))).toBe('invalid-arguments');
	});

	it('answers with an empty roadmap when the file does not exist yet', async () => {
		const project = await roadmapProject();
		const answer = await call(buildRoadmapShowTool(project.options));
		expect(answer.body.horizons).toEqual([]);
	});

	it('reports a file it cannot read instead of throwing', async () => {
		const project = await roadmapProject();
		project.write('ROADMAP.yaml', 'schemaVersion: one\nhorizons: 3\n');
		const answer = await call(buildRoadmapShowTool(project.options));
		expect(answer.isError).toBe(true);
		expect(codeOf(answer)).toBe('roadmap-unreadable');
		expect(reasonOf(answer).length).toBeGreaterThan(0);
	});
});

describe('roadmap_sync', () => {
	it('names what a hand-edited file holds that the timeline never saw', async () => {
		const project = await roadmapProject(roadmap);
		const answer = await call(buildRoadmapSyncTool(project.options));
		expect(answer.body.inSync).toBe(false);
		expect(answer.body.recorded).toBe(0);
		expect((answer.body.pending as object[]).length).toBe(5);
		// It reports; it records nothing.
		expect(existsSync(join(project.root, 'ROADMAP.timeline.md'))).toBe(
			false,
		);
	});

	it('is in sync after a tool made the change', async () => {
		const project = await roadmapProject();
		await call(buildRoadmapPlanInitTool(project.options), {
			version: '1.0.0',
			reason: 'first plan',
			entries: [entry('a', 'committed')],
		});
		const answer = await call(buildRoadmapSyncTool(project.options));
		expect(answer.body).toEqual({
			ok: true,
			inSync: true,
			recorded: 2,
			pending: [],
		});
	});

	it('reports a timeline it cannot read', async () => {
		const project = await roadmapProject(roadmap);
		project.write('ROADMAP.timeline.md', '- {not json\n');
		const answer = await call(buildRoadmapSyncTool(project.options));
		expect(codeOf(answer)).toBe('timeline-unreadable');
		// The unreadable file is the store's to set aside, not this tool's.
		expect(
			readFileSync(join(project.root, 'ROADMAP.timeline.md'), 'utf8'),
		).toContain('{not json');
	});
});

describe('roadmap_readiness', () => {
	it('answers per horizon from the evidence in the workspace', async () => {
		const project = await roadmapProject(roadmap);
		project.write('src/a.ts', 'export {};\n');
		const answer = await call(buildRoadmapReadinessTool(project.options));
		const [first, second] = answer.body.horizons as {
			version: string;
			status: string;
			blockers: { entryId: string }[];
		}[];
		expect(first?.status).toBe('not-ready');
		expect(first?.blockers.map((each) => each.entryId)).toEqual(['b']);
		expect(second?.status).toBe('not-ready');
	});

	it('fails a delivered entry whose path is not there', async () => {
		const project = await roadmapProject(
			roadmapOf(
				horizon('1.0.0', [
					entry('a', 'delivered', [
						{ kind: 'path-exists', target: 'src/a.ts' },
					]),
				]),
			),
		);
		const tool = buildRoadmapReadinessTool(project.options);
		const before = await call(tool, { version: '1.0.0' });
		expect((before.body.horizons as { status: string }[])[0]?.status).toBe(
			'not-ready',
		);
		project.write('src/a.ts', 'export {};\n');
		const after = await call(tool, { version: '1.0.0' });
		expect((after.body.horizons as { status: string }[])[0]?.status).toBe(
			'ready',
		);
	});

	it('reads a proposal gate from the folder the proposal is in', async () => {
		const project = await roadmapProject(
			roadmapOf(
				horizon('1.0.0', [
					entry('a', 'delivered', [
						{ kind: 'proposal-done', target: 'f00001' },
					]),
				]),
			),
		);
		const tool = buildRoadmapReadinessTool(project.options);
		const statusOf = async (): Promise<string | undefined> =>
			((await call(tool)).body.horizons as { status: string }[])[0]
				?.status;
		expect(await statusOf()).toBe('unknown');
		project.write('docs/proposals/done/feats/f00001-a-thing.md', '# x\n');
		expect(await statusOf()).toBe('ready');
	});

	it('honours the gate kinds the project lets block', async () => {
		const project = await roadmapProject(
			roadmapOf(
				horizon('1.0.0', [
					entry('a', 'delivered', [
						{ kind: 'check-green', target: 'ci' },
					]),
				]),
			),
			{ promotion: { blockingGates: ['path-exists'] } },
		);
		const answer = await call(buildRoadmapReadinessTool(project.options));
		expect((answer.body.horizons as { status: string }[])[0]?.status).toBe(
			'ready',
		);
		expect(
			codeOf(
				await call(buildRoadmapReadinessTool(project.options), {
					version: 3,
				}),
			),
		).toBe('invalid-arguments');
	});
});
