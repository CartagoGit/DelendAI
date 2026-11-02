/**
 * skills-are-published.spec.ts — a skill in a package nothing publishes
 * reaches no project: every package with a `skills/` folder lists it in
 * `files`, and no skill lives in `docs/`, which no package publishes.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const root = join(import.meta.dirname, '../../..');

const withSkills = ['packages', 'plugins'].flatMap((group) =>
	readdirSync(join(root, group))
		.map((name) => join(group, name))
		.filter((dir) => existsSync(join(root, dir, 'skills'))),
);

describe('skills reach the projects that use delendai', () => {
	it('publishes every package skills folder', () => {
		expect(withSkills.length).toBeGreaterThan(0);
		const unpublished = withSkills.filter((dir) => {
			const manifest = JSON.parse(
				readFileSync(join(root, dir, 'package.json'), 'utf8'),
			) as { files?: readonly string[] };
			return manifest.files?.includes('skills') !== true;
		});
		expect(unpublished).toEqual([]);
	});

	it('keeps no skill under the documentation', () => {
		const held = readdirSync(join(root, 'docs/delendai/skills'), {
			withFileTypes: true,
		}).filter((entry) => entry.isDirectory());
		expect(held.map((entry) => entry.name)).toEqual([]);
	});
});
