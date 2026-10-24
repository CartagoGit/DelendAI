import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
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
	it('ships a core skill that declares nothing, which is what the manifest assumed', async () => {
		// The projected manifest already defaulted a missing `appliesTo`
		// to `@delendai/*`; selection has to agree, or adding the check
		// would silently stop shipping skills nobody had annotated.
		await mkdir(join(root, 'undeclared'), { recursive: true });
		await writeFile(join(root, 'undeclared', 'SKILL.md'), '# U\n');
		const manifest = JSON.parse(
			await readFile(join(root, 'manifest.json'), 'utf8'),
		) as { skills: unknown[] };
		manifest.skills.push({
			id: 'delendai-undeclared',
			version: '1.0.0',
			minCoreVersion: '0.1.0',
			summary: 'no appliesTo at all',
			bodyPath: 'packages/core/skills/undeclared/SKILL.md',
			tags: [],
		});
		await writeFile(join(root, 'manifest.json'), JSON.stringify(manifest));

		const projection = await buildCoreSkillProjection('docs/agent', {
			sourceRoot: root,
		});

		expect(projection.map((file) => file.relPath)).toContain(
			'docs/agent/skills/delendai-undeclared/SKILL.md',
		);
	});

	it('projects nothing when there is no manifest to read', async () => {
		const empty = await mkdtemp(join(tmpdir(), 'delendai-no-manifest-'));
		try {
			await expect(
				buildCoreSkillProjection('docs/agent', { sourceRoot: empty }),
			).resolves.toStrictEqual([]);
		} finally {
			await rm(empty, { recursive: true, force: true });
		}
	});

	it('projects nothing when the manifest carries no skills list', async () => {
		await writeFile(join(root, 'manifest.json'), JSON.stringify({}));

		await expect(
			buildCoreSkillProjection('docs/agent', { sourceRoot: root }),
		).resolves.toStrictEqual([]);
	});
});
