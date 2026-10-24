import { describe, expect, it } from 'vitest';

import {
	buildSkillCatalog,
	extractSkillDescription,
} from '@delendai/core/lib/skills/skill-catalog';
import type { ISkillBundle } from '@delendai/core/lib/skills/load-skills';

const bundle = (over: Partial<ISkillBundle> = {}): ISkillBundle => ({
	id: 'delendai-operator',
	version: '1.0.0',
	minCoreVersion: '0.1.0',
	bodyPath: 'packages/core/skills/delendai-operator/SKILL.md',
	tags: ['orientation'],
	appliesTo: ['@delendai/*'],
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
		expect(extractSkillDescription('delendai-x', '')).toBe(
			'Skill delendai-x',
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
		expect(catalog.entries[0]?.appliesTo).toEqual(['@delendai/*']);
		expect(catalog.entries[0]).toMatchObject({
			source: 'core',
			owner: '@delendai/core',
			hash: expect.stringMatching(/^sha256:/u),
			estimatedBodyTokens: expect.any(Number),
		});
		// One read at build time (for the description).
		expect(reads).toHaveLength(1);
	});

	it('still advertises a skill whose body is missing, with a minimal description', async () => {
		const reader = async (): Promise<string> => {
			throw new Error('missing');
		};
		const catalog = await buildSkillCatalog('/ws', [bundle()], reader);
		expect(catalog.entries[0]?.description).toBe('Skill delendai-operator');
	});

	it('loadBody returns the full body lazily for a known id', async () => {
		const reader = async (): Promise<string> =>
			'---\ndescription: d\n---\nFULL BODY';
		const catalog = await buildSkillCatalog('/ws', [bundle()], reader);
		expect(await catalog.loadBody('delendai-operator')).toContain(
			'FULL BODY',
		);
	});

	it('loadBody returns undefined for an unknown id', async () => {
		const reader = async (): Promise<string> => '---\n---\nx';
		const catalog = await buildSkillCatalog('/ws', [bundle()], reader);
		expect(await catalog.loadBody('nope')).toBeUndefined();
	});

	it('preserves paragraph fallback when frontmatter has no description', () => {
		const body = [
			'---',
			'name: x',
			'tags: [one]',
			'---',
			'',
			'Body prose.',
		].join('\n');
		expect(extractSkillDescription('x', body)).toBe('Body prose.');
	});

	it('parses a long frontmatter block without pathological slowdown', () => {
		const body = `---\n${'tag: value\n'.repeat(20_000)}---\n\nBody prose.`;
		const started = Date.now();
		expect(extractSkillDescription('x', body)).toBe('Body prose.');
		expect(Date.now() - started).toBeLessThan(500);
	});
});
