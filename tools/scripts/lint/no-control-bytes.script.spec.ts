import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
	controlByteLines,
	main,
	scanForControlBytes,
} from './no-control-bytes.script';

describe('controlByteLines', () => {
	it('names the line and the byte of a raw control character', () => {
		const nul = String.fromCharCode(0);
		expect(
			controlByteLines('a.ts', `const a = 1;\nconst b = '${nul}';`),
		).toEqual(['a.ts:2 (0x00)']);
	});

	it('allows tab, newline, carriage return and written escapes', () => {
		expect(
			controlByteLines('a.ts', "\tconst a = '\\u0000';\r\nconst b = 2;"),
		).toEqual([]);
	});
});

describe('scanForControlBytes', () => {
	it('names the file it could not read instead of skipping it', () => {
		const result = scanForControlBytes(['ok.ts', 'locked.ts'], (file) => {
			if (file === 'locked.ts') throw new Error('EACCES');
			return 'const a = 1;';
		});
		expect(result.unreadable).toEqual(['locked.ts']);
		expect(result.found).toEqual([]);
	});
});

describe('main over a repository', () => {
	const roots: string[] = [];
	afterEach(() => {
		vi.restoreAllMocks();
		for (const root of roots.splice(0)) {
			rmSync(root, { recursive: true, force: true });
		}
	});
	const repo = (files: Record<string, string>): string => {
		const root = mkdtempSync(join(tmpdir(), 'delendai-x01027-'));
		roots.push(root);
		execFileSync('git', ['init', '-q'], { cwd: root });
		for (const [name, text] of Object.entries(files)) {
			writeFileSync(join(root, name), text);
		}
		execFileSync('git', ['add', '-A'], { cwd: root });
		return root;
	};
	const run = (root: string): { code: number; err: string } => {
		const err: string[] = [];
		vi.spyOn(console, 'log').mockImplementation(() => undefined);
		vi.spyOn(console, 'error').mockImplementation((text: string) => {
			err.push(text);
		});
		return { code: main(root), err: err.join('\n') };
	};

	it('passes a clean tree', () => {
		expect(run(repo({ 'a.ts': 'const a = 1;\n' })).code).toBe(0);
	});

	it('refuses a tree with nothing to scan', () => {
		const out = run(repo({ 'notes.md': 'x' }));
		expect(out.code).toBe(1);
		expect(out.err).toContain('no tracked source file');
	});

	it('fails on a raw control byte and names the line', () => {
		const out = run(
			repo({ 'a.ts': `const a = '${String.fromCharCode(0)}';\n` }),
		);
		expect(out.code).toBe(1);
		expect(out.err).toContain('a.ts:1 (0x00)');
	});

	it('fails, naming the file, when a tracked source file cannot be read', () => {
		const root = repo({
			'a.ts': 'const a = 1;\n',
			'b.ts': 'const b = 2;\n',
		});
		unlinkSync(join(root, 'b.ts'));
		const out = run(root);
		expect(out.code).toBe(1);
		expect(out.err).toContain('could not be read');
		expect(out.err).toContain('b.ts');
	});
});
