/**
 * train-assembly.spec.ts — a conflict in a derived file is regenerated on
 * the train, once; any other conflict leaves the member out.
 */
import {
	chmodSync,
	existsSync,
	mkdirSync,
	readFileSync,
	readdirSync,
	writeFileSync,
} from 'node:fs';
import { join } from 'node:path';

import { createGitRepoTemplate } from '@delendai/test-kit';
import { describe, expect, it } from 'vitest';

import { assembleTrain, TRAIN_REGENERATION_SUBJECT } from './train-assembly';

const DERIVED = 'catalog.generated.md';
const TRAIN = 'delendai/train/aaaa/3-5';

/** A forge and a clone of it, built once for the file. */
const template = createGitRepoTemplate({
	trunk: 'develop',
	remote: true,
	files: {
		'authored.ts': 'export const a = 1;\n',
		[DERIVED]: 'catalog: base\n',
	},
});

/**
 * Candidates on the forge, each from the tip: two that add a source file
 * and rewrite the derived catalog from it, so their catalogs conflict, or
 * two that conflict in an authored file.
 */
const project = () => {
	const { root, git } = template.copy();
	const tip = git('rev-parse', 'HEAD');
	const candidate = (
		number: number,
		files: Readonly<Record<string, string>>,
	) => {
		const branch = `delendai/pr/a/implement/x0000${String(number)}-S1-g1/t`;
		git('switch', '-q', '-c', branch, tip);
		for (const [path, text] of Object.entries(files)) {
			writeFileSync(join(root, path), text);
		}
		git('add', '-A');
		git('commit', '-q', '-m', `feat: ${String(number)}`);
		git('push', '-q', 'origin', branch);
		git('switch', '-q', 'develop');
		return { number, headRef: branch, headSha: git('rev-parse', branch) };
	};
	return { root, git, tip, candidate };
};

describe('assembleTrain', () => {
	it('regenerates a conflicting derived file on the train, once, and pushes it', () => {
		const { root, git, tip, candidate } = project();
		const three = candidate(3, {
			'three.ts': '3\n',
			[DERIVED]: 'catalog: 3\n',
		});
		const five = candidate(5, {
			'five.ts': '5\n',
			[DERIVED]: 'catalog: 5\n',
		});
		const runs: string[] = [];
		const outcome = assembleTrain({
			root,
			remote: 'origin',
			tipSha: tip,
			ref: TRAIN,
			members: [three, five],
			derived: new Set([DERIVED]),
			linkDependencies: () => true,
			regenerate: (dir) => {
				runs.push(dir);
				writeFileSync(join(dir, DERIVED), 'catalog: 3, 5\n');
				return true;
			},
		});
		expect(outcome).toEqual({ conflicting: [], regenerated: [5] });
		expect(runs).toHaveLength(1);
		git('fetch', '-q', 'origin', TRAIN);
		expect(git('log', '-1', '--format=%s', 'FETCH_HEAD')).toBe(
			TRAIN_REGENERATION_SUBJECT,
		);
		expect(git('show', `FETCH_HEAD:${DERIVED}`)).toBe('catalog: 3, 5');
		// Each member's head is in the train: the forge records it merged.
		for (const member of [three, five]) {
			expect(() =>
				git(
					'merge-base',
					'--is-ancestor',
					member.headSha,
					'FETCH_HEAD',
				),
			).not.toThrow();
		}
		expect(readFileSync(join(root, DERIVED), 'utf8')).toBe(
			'catalog: base\n',
		);
	});

	it('links the dependencies before the generators run, and pushes a tree equal to a fresh regeneration', () => {
		const { root, git, tip, candidate } = project();
		const three = candidate(3, {
			'three.ts': '3\n',
			[DERIVED]: 'catalog: 3\n',
		});
		const five = candidate(5, {
			'five.ts': '5\n',
			[DERIVED]: 'catalog: 5\n',
		});
		// The generator is a function of the sources, and cannot run without
		// the dependencies: the failure that wrote an empty catalog.
		const generate = (dir: string): boolean => {
			if (!existsSync(join(dir, 'node_modules'))) return false;
			const sources = readdirSync(dir)
				.filter(
					(name) =>
						/^\d?[a-z]+\.ts$/u.test(name) && name !== 'authored.ts',
				)
				.sort();
			writeFileSync(
				join(dir, DERIVED),
				`catalog: ${sources.join(',')}\n`,
			);
			return true;
		};
		const outcome = assembleTrain({
			root,
			remote: 'origin',
			tipSha: tip,
			ref: TRAIN,
			members: [three, five],
			derived: new Set([DERIVED]),
			linkDependencies: (dir) => {
				mkdirSync(join(dir, 'node_modules'));
				return true;
			},
			regenerate: generate,
		});
		expect(outcome.pushFailure).toBeUndefined();
		git('fetch', '-q', 'origin', TRAIN);
		git('worktree', 'add', '-q', '--detach', `${root}-fresh`, 'FETCH_HEAD');
		try {
			const fresh = `${root}-fresh`;
			const pushed = readFileSync(join(fresh, DERIVED), 'utf8');
			mkdirSync(join(fresh, 'node_modules'));
			expect(generate(fresh)).toBe(true);
			expect(pushed).toBe(readFileSync(join(fresh, DERIVED), 'utf8'));
			expect(pushed).toBe('catalog: five.ts,three.ts\n');
		} finally {
			git('worktree', 'remove', '--force', `${root}-fresh`);
		}
	});

	it('pushes nothing when the dependencies cannot be linked', () => {
		const { root, git, tip, candidate } = project();
		const three = candidate(3, { [DERIVED]: 'catalog: 3\n' });
		const five = candidate(5, { [DERIVED]: 'catalog: 5\n' });
		const outcome = assembleTrain({
			root,
			remote: 'origin',
			tipSha: tip,
			ref: TRAIN,
			members: [three, five],
			derived: new Set([DERIVED]),
			linkDependencies: () => false,
			regenerate: () => true,
		});
		expect(outcome).toEqual({ conflicting: [5], regenerated: [] });
		expect(git('ls-remote', 'origin', TRAIN)).toBe('');
	});

	it('returns the reason when the forge declines the push, and the ref stays absent', () => {
		const { root, git, tip, candidate } = project();
		const three = candidate(3, { 'three.ts': '3\n' });
		const hook = join(
			git('remote', 'get-url', 'origin'),
			'hooks',
			'pre-receive',
		);
		writeFileSync(
			hook,
			'#!/bin/sh\necho "creations being restricted" >&2\nexit 1\n',
		);
		chmodSync(hook, 0o755);
		const outcome = assembleTrain({
			root,
			remote: 'origin',
			tipSha: tip,
			ref: TRAIN,
			members: [three],
			derived: new Set([DERIVED]),
			linkDependencies: () => true,
			regenerate: () => true,
		});
		expect(outcome.conflicting).toEqual([]);
		expect(outcome.pushFailure).toContain('creations being restricted');
		expect(git('ls-remote', 'origin', TRAIN)).toBe('');
	});

	it('regenerates the derived files of a train whose members merged cleanly', () => {
		const { root, git, tip, candidate } = project();
		const three = candidate(3, { 'three.ts': '3\n' });
		let ran = 0;
		const outcome = assembleTrain({
			root,
			remote: 'origin',
			tipSha: tip,
			ref: TRAIN,
			members: [three],
			derived: new Set([DERIVED]),
			linkDependencies: () => true,
			regenerate: (dir) => {
				ran += 1;
				writeFileSync(join(dir, DERIVED), 'fresh\n');
				return true;
			},
		});
		expect(ran).toBe(1);
		expect(outcome.pushFailure).toBeUndefined();
		expect(git('show', `origin/${TRAIN}:${DERIVED}`)).toBe('fresh');
	});

	it('pushes nothing when the regeneration of a clean train fails', () => {
		const { root, git, tip, candidate } = project();
		const three = candidate(3, { 'three.ts': '3\n' });
		const outcome = assembleTrain({
			root,
			remote: 'origin',
			tipSha: tip,
			ref: TRAIN,
			members: [three],
			derived: new Set([DERIVED]),
			linkDependencies: () => true,
			regenerate: () => false,
		});
		expect(outcome.pushFailure).toContain('regenerating');
		expect(git('ls-remote', 'origin', TRAIN)).toBe('');
	});

	it('leaves out a member that conflicts in an authored file, and pushes nothing', () => {
		const { root, git, tip, candidate } = project();
		const three = candidate(3, { 'authored.ts': 'export const a = 3;\n' });
		const four = candidate(4, { 'authored.ts': 'export const a = 4;\n' });
		const outcome = assembleTrain({
			root,
			remote: 'origin',
			tipSha: tip,
			ref: TRAIN,
			members: [three, four],
			derived: new Set([DERIVED]),
			regenerate: () => true,
		});
		expect(outcome).toEqual({ conflicting: [4], regenerated: [] });
		expect(git('ls-remote', 'origin', TRAIN)).toBe('');
	});

	it('leaves out the members whose derived files could not be regenerated', () => {
		const { root, tip, candidate } = project();
		const three = candidate(3, { [DERIVED]: 'catalog: 3\n' });
		const five = candidate(5, { [DERIVED]: 'catalog: 5\n' });
		expect(
			assembleTrain({
				root,
				remote: 'origin',
				tipSha: tip,
				ref: TRAIN,
				members: [three, five],
				derived: new Set([DERIVED]),
				regenerate: () => false,
			}),
		).toEqual({ conflicting: [5], regenerated: [] });
	});
});
