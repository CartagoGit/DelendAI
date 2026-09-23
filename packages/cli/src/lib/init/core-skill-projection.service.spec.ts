import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { buildCoreSkillProjection } from './core-skill-projection.service';

describe('buildCoreSkillProjection', () => {
	let root = '';

	beforeEach(async () => {
		root = await mkdtemp(join(tmpdir(), 'delendai-core-skills-'));
		await mkdir(join(root, 'operator'), { recursive: true });
		await mkdir(join(root, 'plugin-only'), { recursive: true });
		await mkdir(join(root, 'tabs-component'), { recursive: true });
		await mkdir(join(root, 'release'), { recursive: true });
		await writeFile(
			join(root, 'manifest.json'),
			JSON.stringify({
				generatedAt: '2026-07-25T00:00:00.000Z',
				skills: [
					{
						id: 'delendai-operator',
						version: '1.0.0',
						minCoreVersion: '0.1.0',
						summary: 'orient',
						bodyPath: 'packages/core/skills/operator/SKILL.md',
						tags: ['operator'],
						appliesTo: ['@delendai/*'],
					},
					{
						id: 'delendai-tabs-component',
						version: '1.0.0',
						minCoreVersion: '0.1.0',
						summary: 'our own website component',
						bodyPath:
							'packages/core/skills/tabs-component/SKILL.md',
						tags: ['tabs'],
						appliesTo: ['@delendai/web'],
					},
					{
						id: 'delendai-release',
						version: '1.0.0',
						minCoreVersion: '0.1.0',
						summary: 'anyone who installed core',
						bodyPath: 'packages/core/skills/release/SKILL.md',
						tags: ['release'],
						appliesTo: ['@delendai/core'],
					},
					{
						id: 'plugin-only',
						version: '1.0.0',
						minCoreVersion: '0.1.0',
						bodyPath: 'plugins/example/skills/plugin-only/SKILL.md',
						tags: ['plugin'],
					},
				],
			}),
		);
		await writeFile(join(root, 'operator', 'SKILL.md'), '# Operator\n');
		await writeFile(join(root, 'tabs-component', 'SKILL.md'), '# Tabs\n');
		await writeFile(join(root, 'release', 'SKILL.md'), '# Release\n');
	});

	afterEach(async () => rm(root, { recursive: true, force: true }));

	it('projects only portable core skills with consumer-relative body paths', async () => {
		const projection = await buildCoreSkillProjection('docs/agent', {
			sourceRoot: root,
		});
		expect(projection.map((file) => file.relPath)).toEqual([
			'docs/agent/skills/manifest.json',
			'docs/agent/skills/delendai-operator/SKILL.md',
			'docs/agent/skills/delendai-release/SKILL.md',
		]);
		const manifest = JSON.parse(projection[0]?.content ?? '{}');
		expect(manifest.skills[0].bodyPath).toBe(
			'docs/agent/skills/delendai-operator/SKILL.md',
		);
	});

	it('leaves behind a core skill that is about one of OUR packages (x00615)', async () => {
		// `delendai-tabs-component` documents this repository's own website
		// component. Its body sits in the core bundle, so selection by
		// LOCATION installed it into every adopter; selection by what it
		// DECLARES does not.
		const projection = await buildCoreSkillProjection('docs/agent', {
			sourceRoot: root,
		});

		expect(projection.map((file) => file.relPath)).not.toContain(
			'docs/agent/skills/delendai-tabs-component/SKILL.md',
		);
		const manifest = JSON.parse(projection[0]?.content ?? '{}') as {
			skills: readonly { id: string }[];
		};
		expect(manifest.skills.map((skill) => skill.id)).not.toContain(
			'delendai-tabs-component',
		);
	});

	it('keeps a skill scoped to the core an adopter installed', async () => {
		const projection = await buildCoreSkillProjection('docs/agent', {
			sourceRoot: root,
		});

		expect(projection.map((file) => file.relPath)).toContain(
			'docs/agent/skills/delendai-release/SKILL.md',
		);
	});
});
