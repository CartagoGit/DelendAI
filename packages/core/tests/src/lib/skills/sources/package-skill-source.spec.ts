import { describe, expect, it } from 'vitest';

import { packageSkillSource } from '@delendai/core/lib/skills/sources/package-skill-source';

describe('packageSkillSource', () => {
	it('discovers compact descriptors and loads the body on demand', async () => {
		const files: Record<string, string> = {
			'/pkg/skills/portable/SKILL.md': [
				'---',
				'name: mcp-vertex-portable',
				'tags: [portable, package]',
				"appliesTo: ['@delendai/core']",
				'description: Use this skill for portable package checks.',
				'---',
				'Full instructions stay out of the startup catalog.',
			].join('\n'),
		};
		let reads = 0;
		const source = packageSkillSource({
			id: 'core-package',
			packageRoot: '/pkg',
			owner: '@delendai/core',
			packageVersion: '1.2.3',
			listDir: async () => ['portable', 'missing'],
			readFile: async (path) => {
				reads += 1;
				const body = files[path];
				if (body === undefined) throw new Error('missing');
				return body;
			},
		});

		const descriptors = await source.list();
		expect(descriptors).toHaveLength(1);
		expect(descriptors[0]).toMatchObject({
			id: 'mcp-vertex-portable',
			version: '1.2.3',
			source: 'package',
			owner: '@delendai/core',
			tags: ['portable', 'package'],
			appliesTo: ['@delendai/core'],
			description: 'Use this skill for portable package checks.',
		});
		expect(descriptors[0]?.hash).toMatch(/^sha256:/u);
		const readsAfterList = reads;

		const loaded = await source.load('mcp-vertex-portable');
		expect(loaded?.body).toContain('Full instructions');
		expect(reads).toBeGreaterThan(readsAfterList);
		expect(await source.load('../portable')).toBeNull();
	});
});
