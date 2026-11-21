/**
 * roadmap-drift.script.spec.ts — the guard fails when a projection lags
 * the roadmap file and passes once it is regenerated; a project with no
 * roadmap has nothing to fail.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
	declaredRoadmap,
	deriveRoadmap,
	ROADMAP_PROJECTION_PATH,
	roadmapDrift,
} from '../gen/roadmap-projection.lib';

const projects: string[] = [];

afterEach(() => {
	for (const dir of projects.splice(0)) {
		rmSync(dir, { recursive: true, force: true });
	}
});

const ROADMAP = `---
schemaVersion: 1
horizons:
  - version: 1.0.0
    entries:
      - id: a
        title: A thing
        kind: feature
        state: committed
        gates: []
---
Prose the tools keep.
`;

const project = (files: Record<string, string>): string => {
	const root = mkdtempSync(join(tmpdir(), 'roadmap-drift-'));
	projects.push(root);
	for (const [path, content] of Object.entries(files)) {
		mkdirSync(dirname(join(root, path)), { recursive: true });
		writeFileSync(join(root, path), content);
	}
	return root;
};

const CONFIG = JSON.stringify({
	plugins: { roadmap: { options: { file: 'plan/ROADMAP.md' } } },
});

/** What the generator does: write the projection, record what is pending. */
const regenerate = async (root: string): Promise<void> => {
	const derived = await deriveRoadmap(root, () => '2026-10-11T00:00:00.000Z');
	if (!derived.ok) throw new Error(derived.reason);
	mkdirSync(dirname(join(root, ROADMAP_PROJECTION_PATH)), {
		recursive: true,
	});
	writeFileSync(join(root, ROADMAP_PROJECTION_PATH), derived.value.text);
	await derived.value.workspace?.timeline.append(derived.value.pending);
};

describe('declaredRoadmap', () => {
	it('is the options of a project that names a roadmap file', () => {
		expect(declaredRoadmap(CONFIG)).toEqual({ file: 'plan/ROADMAP.md' });
	});

	it('is nothing without a file, a configuration, or readable options', () => {
		expect(declaredRoadmap(undefined)).toBeUndefined();
		expect(declaredRoadmap('{not json')).toBeUndefined();
		expect(declaredRoadmap('{}')).toBeUndefined();
		expect(
			declaredRoadmap(
				'{"plugins":{"roadmap":{"options":{"branch":"x"}}}}',
			),
		).toBeUndefined();
	});
});

describe('roadmapDrift', () => {
	it('fails until the projection and the timeline are generated', async () => {
		const root = project({
			'delendai.config.json': CONFIG,
			'plan/ROADMAP.md': ROADMAP,
		});
		const before = await roadmapDrift(root);
		expect(before).toHaveLength(2);
		expect(before[0]).toContain(ROADMAP_PROJECTION_PATH);
		expect(before[1]).toContain('the timeline lacks 2 change(s)');
		await regenerate(root);
		expect(await roadmapDrift(root)).toEqual([]);
	});

	it('fails again when the roadmap file is edited by hand, and names the change', async () => {
		const root = project({
			'delendai.config.json': CONFIG,
			'plan/ROADMAP.md': ROADMAP,
		});
		await regenerate(root);
		writeFileSync(
			join(root, 'plan/ROADMAP.md'),
			ROADMAP.replace('state: committed', 'state: in-progress'),
		);
		const drift = await roadmapDrift(root);
		expect(drift).toHaveLength(2);
		expect(drift[1]).toContain('entry-state-changed a');
		await regenerate(root);
		expect(await roadmapDrift(root)).toEqual([]);
	});

	it('is deterministic: a second generation writes the same bytes and records nothing', async () => {
		const root = project({
			'delendai.config.json': CONFIG,
			'plan/ROADMAP.md': ROADMAP,
		});
		await regenerate(root);
		const first = await deriveRoadmap(root);
		const second = await deriveRoadmap(root);
		if (!first.ok || !second.ok) throw new Error('derive failed');
		expect(second.value.text).toBe(first.value.text);
		expect(second.value.pending).toEqual([]);
	});

	it('has nothing to fail in a project that declares no roadmap', async () => {
		const root = project({ 'delendai.config.json': '{}' });
		expect(await roadmapDrift(root)).toEqual([
			`${ROADMAP_PROJECTION_PATH} is not what the roadmap file projects to`,
		]);
		await regenerate(root);
		expect(await roadmapDrift(root)).toEqual([]);
	});

	it('says so when the roadmap file cannot be read', async () => {
		const root = project({
			'delendai.config.json': CONFIG,
			'plan/ROADMAP.md': 'no front matter here\n',
		});
		const [finding] = await roadmapDrift(root);
		expect(finding).toContain('the roadmap could not be read');
	});
});
