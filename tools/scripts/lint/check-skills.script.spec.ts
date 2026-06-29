#!/usr/bin/env bun
import { describe, expect, it } from 'vitest';

import {
	checkSkillsManifest,
	type ISkillManifest,
} from './check-skills.script.ts';

const manifest = (skills: ISkillManifest['skills']): ISkillManifest => ({
	generatedAt: '2026-06-21T00:00:00.000Z',
	skills,
});

describe('checkSkillsManifest', async () => {
	it('reports no issues when every manifest entry has a matching file and vice versa', async () => {
		const issues = checkSkillsManifest(
			manifest([
				{
					id: 'mcp-vertex-operator',
					version: '1.0.0',
					minCoreVersion: '0.1.0',
					bodyPath:
						'packages/core/skills/mcp-vertex-operator/SKILL.md',
					tags: ['operator'],
					appliesTo: ['@mcp-vertex/*'],
				},
			]),
			['packages/core/skills/mcp-vertex-operator/SKILL.md'],
		);

		expect(issues).toEqual([]);
	});

	it('flags a manifest entry whose bodyPath does not exist on disk', async () => {
		const issues = checkSkillsManifest(
			manifest([
				{
					id: 'ghost-skill',
					version: '1.0.0',
					minCoreVersion: '0.1.0',
					bodyPath: 'skills/ghost-skill/SKILL.md',
					tags: [],
					appliesTo: ['@mcp-vertex/*'],
				},
			]),
			[],
		);

		expect(issues).toEqual([
			{
				kind: 'missing-on-disk',
				detail: expect.stringContaining('ghost-skill'),
			},
		]);
	});

	it('flags a SKILL.md on disk with no manifest entry', async () => {
		const issues = checkSkillsManifest(manifest([]), [
			'skills/undeclared-skill/SKILL.md',
		]);

		expect(issues).toEqual([
			{
				kind: 'missing-in-manifest',
				detail: expect.stringContaining('undeclared-skill'),
			},
		]);
	});

	it('flags a malformed (non-semver) version', async () => {
		const issues = checkSkillsManifest(
			manifest([
				{
					id: 'bad-version',
					version: 'v1',
					minCoreVersion: '0.1.0',
					bodyPath: 'skills/bad-version/SKILL.md',
					tags: [],
					appliesTo: ['@mcp-vertex/*'],
				},
			]),
			['skills/bad-version/SKILL.md'],
		);

		expect(
			issues.some(
				(i) =>
					i.kind === 'malformed-entry' &&
					i.detail.includes('version'),
			),
		).toBe(true);
	});

	it('flags a malformed (non-semver) minCoreVersion', async () => {
		const issues = checkSkillsManifest(
			manifest([
				{
					id: 'bad-min-core',
					version: '1.0.0',
					minCoreVersion: 'latest',
					bodyPath: 'skills/bad-min-core/SKILL.md',
					appliesTo: ['@mcp-vertex/*'],
					tags: [],
				},
			]),
			['skills/bad-min-core/SKILL.md'],
		);

		expect(
			issues.some(
				(i) =>
					i.kind === 'malformed-entry' &&
					i.detail.includes('minCoreVersion'),
			),
		).toBe(true);
	});

	it('flags a manifest entry with no appliesTo (f00057 S5)', async () => {
		const issues = checkSkillsManifest(
			manifest([
				{
					id: 'no-applies',
					version: '1.0.0',
					minCoreVersion: '0.1.0',
					bodyPath: 'skills/no-applies/SKILL.md',
					tags: [],
					appliesTo: [],
				},
			]),
			['skills/no-applies/SKILL.md'],
		);

		expect(
			issues.some(
				(i) =>
					i.kind === 'missing-applies-to' &&
					i.detail.includes('no-applies'),
			),
		).toBe(true);
	});

	it('flags a manifest entry whose appliesTo is missing (f00057 S5)', async () => {
		const issues = checkSkillsManifest(
			manifest([
				{
					id: 'missing-applies-field',
					version: '1.0.0',
					minCoreVersion: '0.1.0',
					bodyPath: 'skills/missing-applies-field/SKILL.md',
					tags: [],
				} as unknown as ISkillManifest['skills'][number],
			]),
			['skills/missing-applies-field/SKILL.md'],
		);

		expect(
			issues.some(
				(i) =>
					i.kind === 'missing-applies-to' &&
					i.detail.includes('missing-applies-field'),
			),
		).toBe(true);
	});
});
