import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { loadSkills } from '@mcp-vertex/core/public';

let dir: string;
let manifestPath: string;

beforeEach(() => {
	dir = mkdtempSync(join(tmpdir(), 'load-skills-'));
	manifestPath = join(dir, 'manifest.json');
});

afterEach(() => {
	rmSync(dir, { recursive: true, force: true });
});

const writeManifest = (skills: unknown): void => {
	writeFileSync(
		manifestPath,
		JSON.stringify({ generatedAt: '2026-06-21T00:00:00.000Z', skills }),
	);
};

describe('loadSkills', async () => {
	it('returns every entry whose minCoreVersion is satisfied by the given core version', async () => {
		writeManifest([
			{
				id: 'a',
				version: '1.0.0',
				minCoreVersion: '0.1.0',
				bodyPath: 'skills/a/SKILL.md',
				tags: [],
			},
			{
				id: 'b',
				version: '1.0.0',
				minCoreVersion: '0.1.0',
				bodyPath: 'skills/b/SKILL.md',
				tags: [],
			},
		]);

		const skills = await loadSkills(manifestPath, '0.1.0');

		expect(skills.map((s) => s.id)).toEqual(['a', 'b']);
	});

	it('excludes a skill whose minCoreVersion is newer than the given core version', async () => {
		writeManifest([
			{
				id: 'old',
				version: '1.0.0',
				minCoreVersion: '0.1.0',
				bodyPath: 'skills/old/SKILL.md',
				tags: [],
			},
			{
				id: 'new',
				version: '1.0.0',
				minCoreVersion: '0.5.0',
				bodyPath: 'skills/new/SKILL.md',
				tags: [],
			},
		]);

		const skills = await loadSkills(manifestPath, '0.2.0');

		expect(skills.map((s) => s.id)).toEqual(['old']);
	});

	it('returns [] when the manifest file does not exist', async () => {
		const skills = await loadSkills(join(dir, 'missing.json'), '0.1.0');

		expect(skills).toEqual([]);
	});

	it('returns [] when the manifest is malformed JSON', async () => {
		writeFileSync(manifestPath, '{ not json');

		const skills = await loadSkills(manifestPath, '0.1.0');

		expect(skills).toEqual([]);
	});

	it('excludes (does not throw on) a skill with a non-semver minCoreVersion', async () => {
		writeManifest([
			{
				id: 'bad',
				version: '1.0.0',
				minCoreVersion: 'latest',
				bodyPath: 'skills/bad/SKILL.md',
				tags: [],
			},
		]);

		const skills = await loadSkills(manifestPath, '0.1.0');

		expect(skills).toEqual([]);
	});

	it('includes a skill exactly at the boundary minCoreVersion', async () => {
		writeManifest([
			{
				id: 'boundary',
				version: '1.0.0',
				minCoreVersion: '0.3.0',
				bodyPath: 'skills/boundary/SKILL.md',
				tags: [],
			},
		]);

		const skills = await loadSkills(manifestPath, '0.3.0');

		expect(skills.map((s) => s.id)).toEqual(['boundary']);
	});
});
