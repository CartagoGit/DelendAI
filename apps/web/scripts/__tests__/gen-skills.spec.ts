import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { walkSkillsForTest as walkSkills } from '../gen-skills';

describe('walkSkills (l106 s1)', () => {
	let tmp: string;

	beforeAll(() => {
		tmp = mkdtempSync(join(tmpdir(), 'mcp-gen-skills-'));
		// Mimic the repo convention: skills/<plugin>/SKILL.md.
		mkdirSync(join(tmp, 'skills', 'foo'), { recursive: true });
		writeFileSync(
			join(tmp, 'skills', 'foo', 'SKILL.md'),
			[
				'---',
				'id: foo',
				'name: Foo',
				'description: A first skill',
				'---',
				'',
				'Body of the foo skill. It explains things.',
				'',
			].join('\n'),
		);
		mkdirSync(join(tmp, 'skills', 'bar'), { recursive: true });
		writeFileSync(
			join(tmp, 'skills', 'bar', 'SKILL.md'),
			[
				'---',
				'id: bar',
				'name: Bar',
				'description: A second skill',
				'---',
				'',
				'Body of the bar skill.',
				'',
			].join('\n'),
		);
		// A non-SKILL.md file that must be ignored.
		writeFileSync(join(tmp, 'skills', 'README.md'), 'not a skill');
		// A deep-nested skill (recurse is allowed).
		mkdirSync(join(tmp, 'skills', 'baz', 'sub'), { recursive: true });
		writeFileSync(
			join(tmp, 'skills', 'baz', 'sub', 'SKILL.md'),
			[
				'---',
				'id: baz',
				'name: Baz',
				'---',
				'',
				'Deep skill body.',
				'',
			].join('\n'),
		);
	});

	afterAll(() => {
		rmSync(tmp, { recursive: true, force: true });
	});

	it('returns [] for a non-existent directory', () => {
		expect(walkSkills(join(tmp, 'does-not-exist'))).toEqual([]);
	});

	it('discovers SKILL.md files in plugin subdirectories', () => {
		const skills = walkSkills(join(tmp, 'skills'));
		// Two top-level skills + one nested = 3.
		expect(skills).toHaveLength(3);
		const ids = skills.map((s) => s.id).sort();
		expect(ids).toEqual(['bar', 'baz', 'foo']);
	});

	it('builds path/ plugin/ using the nested shape slugFromPath expects', () => {
		const skills = walkSkills(join(tmp, 'skills'));
		const foo = skills.find((s) => s.id === 'foo');
		expect(foo?.path).toBe('skills/foo/SKILL.md');
		expect(foo?.plugin).toBe('foo');
		const baz = skills.find((s) => s.id === 'baz');
		expect(baz?.path).toBe('skills/baz/sub/SKILL.md');
		expect(baz?.plugin).toBe('baz');
	});

	it('ignores files that are not SKILL.md', () => {
		const skills = walkSkills(join(tmp, 'skills'));
		expect(
			skills.find((s) => s.path.endsWith('README.md')),
		).toBeUndefined();
	});
});
