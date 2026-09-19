/**
 * generated-merge-driver.script.spec.ts — a conflict in a derived file is
 * resolved by deriving it again, and never by guessing a side.
 */
import {
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
	GENERATED_MERGE_RULES,
	resolveGenerated,
	ruleFor,
} from './generated-merge-driver.script';

const roots: string[] = [];
const workspace = (): string => {
	const root = mkdtempSync(join(tmpdir(), 'merge-driver-'));
	roots.push(root);
	return root;
};

afterEach(() => {
	for (const root of roots.splice(0)) {
		rmSync(root, { recursive: true, force: true });
	}
});

describe('the table of derived files', () => {
	it('names a generator for the bootstrap and the catalog', () => {
		expect(ruleFor('docs/delendai/AGENT-BOOTSTRAP.md')?.command).toBe(
			'gen:quantitative',
		);
		expect(
			ruleFor('docs/delendai/agent-catalog.generated.json')?.command,
		).toBe('catalog:generate');
	});

	it('matches a path given with a leading directory, as git passes it', () => {
		expect(
			ruleFor('/abs/repo/docs/delendai/AGENT-BOOTSTRAP.md'),
		).toBeDefined();
	});

	it('claims nothing it cannot generate', () => {
		expect(ruleFor('packages/core/src/index.ts')).toBeUndefined();
		expect(ruleFor('README.md')).toBeUndefined();
	});

	it('says, for every entry, why the file is derived', () => {
		for (const rule of GENERATED_MERGE_RULES) {
			expect(rule.because.length).toBeGreaterThan(20);
			expect(rule.paths.length).toBeGreaterThan(0);
		}
	});
});

describe('resolveGenerated', () => {
	it('replaces the conflicted file with what the generator produced', () => {
		const root = workspace();
		const path = 'docs/delendai/AGENT-BOOTSTRAP.md';
		mkdirSync(join(root, 'docs/delendai'), { recursive: true });
		const ours = join(root, 'ours.tmp');
		writeFileSync(ours, '<<<<<<< HEAD\nmine\n=======\ntheirs\n>>>>>>>\n');
		const code = resolveGenerated({
			root,
			ours,
			path,
			run: (command, cwd) => {
				expect(command).toBe('gen:quantitative');
				writeFileSync(join(cwd, path), 'generated from the tree\n');
			},
		});
		expect(code).toBe(0);
		expect(readFileSync(ours, 'utf8')).toBe('generated from the tree\n');
	});

	it('leaves the conflict alone for a file it does not generate', () => {
		const root = workspace();
		const ours = join(root, 'ours.tmp');
		writeFileSync(ours, 'conflicted\n');
		expect(
			resolveGenerated({
				root,
				ours,
				path: 'packages/core/src/index.ts',
				run: () => {
					throw new Error('must not run');
				},
			}),
		).toBe(1);
		expect(readFileSync(ours, 'utf8')).toBe('conflicted\n');
	});

	it('fails rather than pretend, when the generator cannot run', () => {
		const root = workspace();
		const ours = join(root, 'ours.tmp');
		writeFileSync(ours, 'conflicted\n');
		expect(
			resolveGenerated({
				root,
				ours,
				path: 'docs/delendai/AGENT-BOOTSTRAP.md',
				run: () => {
					throw new Error('generator exploded');
				},
			}),
		).toBe(1);
	});

	it('fails when the generator produced nothing at the path', () => {
		const root = workspace();
		const ours = join(root, 'ours.tmp');
		writeFileSync(ours, 'conflicted\n');
		expect(
			resolveGenerated({
				root,
				ours,
				path: 'docs/delendai/agent-catalog.generated.json',
				run: () => undefined,
			}),
		).toBe(1);
	});
});
