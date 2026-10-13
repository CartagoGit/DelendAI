#!/usr/bin/env bun
/**
 * skills-script.spec.ts — the three answers this gate is allowed to give
 * about a declared skill, pinned against a real directory.
 *
 * The one worth a spec is `missing-on-disk`: the check used to `stat`
 * the body and then read it, believing the first answer. Reading once
 * and letting the read decide is the same verdict with one fewer window
 * for another agent to move the file through — and a gate that fails
 * because somebody else was finishing a file teaches its own agents that
 * gates are noise.
 */
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { lintSkillsManifest } from './skills-script.ts';

const roots: string[] = [];

afterEach(async () => {
	await Promise.all(
		roots
			.splice(0)
			.map((root) => rm(root, { recursive: true, force: true })),
	);
});

const fixture = async (
	files: Readonly<Record<string, string>>,
	skills: readonly { id: string; bodyPath: string }[],
): Promise<{ manifestPath: string; rootDir: string }> => {
	const root = await mkdtemp(join(tmpdir(), 'skills-lint-'));
	roots.push(root);
	for (const [rel, content] of Object.entries(files)) {
		const abs = join(root, rel);
		await mkdir(dirname(abs), { recursive: true });
		await writeFile(abs, content, 'utf8');
	}
	const manifestPath = join(root, 'manifest.json');
	await writeFile(
		manifestPath,
		JSON.stringify({
			generatedAt: '2026-09-14T00:00:00.000Z',
			skills: skills.map((skill) => ({
				id: skill.id,
				version: '1.0.0',
				minCoreVersion: '0.1.0',
				bodyPath: skill.bodyPath,
				tags: [],
				appliesTo: [],
			})),
		}),
		'utf8',
	);
	return { manifestPath, rootDir: root };
};

const skillBody = (name: string): string =>
	`---\nname: ${name}\ndescription: A skill.\n---\n\nBody.\n`;

describe('lintSkillsManifest', () => {
	it('reports nothing when the body is there and its frontmatter agrees', async () => {
		const { manifestPath, rootDir } = await fixture(
			{ 'skills/demo/SKILL.md': skillBody('demo') },
			[{ id: 'demo', bodyPath: 'skills/demo/SKILL.md' }],
		);

		expect(await lintSkillsManifest(manifestPath, rootDir)).toEqual([]);
	});

	it('reports missing-on-disk for a body that is not there', async () => {
		const { manifestPath, rootDir } = await fixture({}, [
			{ id: 'ghost', bodyPath: 'skills/ghost/SKILL.md' },
		]);

		const issues = await lintSkillsManifest(manifestPath, rootDir);

		expect(issues).toHaveLength(1);
		expect(issues[0]?.kind).toBe('missing-on-disk');
		expect(issues[0]?.detail).toContain('skills/ghost/SKILL.md');
	});

	it('reports missing-on-disk when the path names a directory rather than a file', async () => {
		// A directory answers a `stat` happily and refuses a read. The
		// gate should say the same thing either way.
		const { manifestPath, rootDir } = await fixture(
			{ 'skills/dir/SKILL.md/keep.txt': 'x' },
			[{ id: 'dir', bodyPath: 'skills/dir/SKILL.md' }],
		);

		const issues = await lintSkillsManifest(manifestPath, rootDir);

		expect(issues.map((issue) => issue.kind)).toEqual(['missing-on-disk']);
	});

	it('reports frontmatter-id-drift when the body names something else', async () => {
		const { manifestPath, rootDir } = await fixture(
			{ 'skills/demo/SKILL.md': skillBody('renamed') },
			[{ id: 'demo', bodyPath: 'skills/demo/SKILL.md' }],
		);

		const issues = await lintSkillsManifest(manifestPath, rootDir);

		expect(issues.map((issue) => issue.kind)).toEqual([
			'frontmatter-id-drift',
		]);
	});

	it('reports a duplicate id once, not once per repetition', async () => {
		const { manifestPath, rootDir } = await fixture(
			{ 'skills/demo/SKILL.md': skillBody('demo') },
			[
				{ id: 'demo', bodyPath: 'skills/demo/SKILL.md' },
				{ id: 'demo', bodyPath: 'skills/demo/SKILL.md' },
				{ id: 'demo', bodyPath: 'skills/demo/SKILL.md' },
			],
		);

		const issues = await lintSkillsManifest(manifestPath, rootDir);

		expect(
			issues.filter((issue) => issue.kind === 'duplicate-id'),
		).toHaveLength(1);
	});
});
