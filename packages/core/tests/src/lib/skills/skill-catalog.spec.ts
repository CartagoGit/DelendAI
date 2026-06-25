import { describe, expect, it } from 'vitest';

import {
	buildSkillCatalog,
	extractSkillDescription,
} from '@mcp-vertex/core/lib/skills/skill-catalog';
import type { ISkillBundle } from '@mcp-vertex/core/lib/skills/load-skills';

const bundle = (over: Partial<ISkillBundle> = {}): ISkillBundle => ({
	id: 'mcp-vertex-operator',
	version: '1.0.0',
	minCoreVersion: '0.1.0',
	bodyPath: 'packages/core/skills/mcp-vertex-operator/SKILL.md',
	tags: ['orientation'],
	appliesTo: ['@mcp-vertex/*'],
	...over,
});

describe('extractSkillDescription', () => {
	it('prefers the inline frontmatter description (collapsed to one line)', () => {
		const body = [
			'---',
			'name: x',
			'description: What it is and   when   to use it.',
			'---',
			'',
			'# Heading',
			'',
			'Body paragraph.',
		].join('\n');
		expect(extractSkillDescription('x', body)).toBe(
			'What it is and when to use it.',
		);
	});

	it('reads a folded block description (description: >)', () => {
		const body = [
			'---',
			'name: x',
			'description: >',
			'  First line of the folded description',
			'  continues on the next line.',
			'---',
			'',
			'# Heading',
		].join('\n');
		expect(extractSkillDescription('x', body)).toBe(
			'First line of the folded description continues on the next line.',
		);
	});

	it('falls back to the first prose paragraph when no description key', () => {
		const body = [
			'---',
			'name: x',
			'---',
			'',
			'# Heading',
			'',
			'The first real paragraph.',
		].join('\n');
		expect(extractSkillDescription('x', body)).toBe(
			'The first real paragraph.',
		);
	});

	it('falls back to "Skill <id>" when there is no usable text', () => {
		expect(extractSkillDescription('mcp-vertex-x', '')).toBe(
			'Skill mcp-vertex-x',
		);
	});
});

describe('buildSkillCatalog', () => {
	it('extracts one compact description per skill, reading each body once', async () => {
		const reads: string[] = [];
		const reader = async (abs: string): Promise<string> => {
			reads.push(abs);
			return ['---', 'description: Orient first.', '---', 'Body.'].join(
				'\n',
			);
		};
		const catalog = await buildSkillCatalog('/ws', [bundle()], reader);
		expect(catalog.entries).toHaveLength(1);
		expect(catalog.entries[0]?.description).toBe('Orient first.');
		expect(catalog.entries[0]?.appliesTo).toEqual(['@mcp-vertex/*']);
		// One read at build time (for the description).
		expect(reads).toHaveLength(1);
	});

	it('still advertises a skill whose body is missing, with a minimal description', async () => {
		const reader = async (): Promise<string> => {
			throw new Error('missing');
		};
		const catalog = await buildSkillCatalog('/ws', [bundle()], reader);
		expect(catalog.entries[0]?.description).toBe(
			'Skill mcp-vertex-operator',
		);
	});

	it('loadBody returns the full body lazily for a known id', async () => {
		const reader = async (): Promise<string> =>
			'---\ndescription: d\n---\nFULL BODY';
		const catalog = await buildSkillCatalog('/ws', [bundle()], reader);
		expect(await catalog.loadBody('mcp-vertex-operator')).toContain(
			'FULL BODY',
		);
	});

	it('loadBody returns undefined for an unknown id', async () => {
		const reader = async (): Promise<string> => '---\n---\nx';
		const catalog = await buildSkillCatalog('/ws', [bundle()], reader);
		expect(await catalog.loadBody('nope')).toBeUndefined();
	});
});
