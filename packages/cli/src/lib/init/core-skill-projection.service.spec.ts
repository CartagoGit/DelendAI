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
	});

	afterEach(async () => rm(root, { recursive: true, force: true }));

	it('projects only portable core skills with consumer-relative body paths', async () => {
		const projection = await buildCoreSkillProjection('docs/agent', {
			sourceRoot: root,
		});
		expect(projection.map((file) => file.relPath)).toEqual([
			'docs/agent/skills/manifest.json',
			'docs/agent/skills/delendai-operator/SKILL.md',
		]);
		const manifest = JSON.parse(projection[0]?.content ?? '{}');
		expect(manifest.skills[0].bodyPath).toBe(
			'docs/agent/skills/delendai-operator/SKILL.md',
		);
	});
});
