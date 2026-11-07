/**
 * no-process-cwd-in-core.script.spec.ts — only code counts, not what
 * comments and strings say about process.cwd().
 */
import { describe, expect, it } from 'vitest';

import { codeOnly, processCwdCalls } from './no-process-cwd-in-core.script';

describe('no-process-cwd-in-core', () => {
	it('finds a call in code, on its line', () => {
		expect(
			processCwdCalls('const a = 1;\nconst root = process.cwd();\n'),
		).toEqual([2]);
		expect(processCwdCalls('f(process . cwd ())')).toEqual([1]);
	});

	it('ignores comments and string text', () => {
		const text = [
			'// never process.cwd() here',
			'/* nor process.cwd()',
			'   across lines */',
			"const a = 'process.cwd()';",
			'const b = "process.cwd()";',
			'const c = `export const x = process.cwd();`;',
		].join('\n');
		expect(processCwdCalls(text)).toEqual([]);
	});

	it('reads the code inside a template substitution', () => {
		expect(processCwdCalls('const t = `root: ${process.cwd()}`;')).toEqual([
			1,
		]);
		expect(
			processCwdCalls('const t = `a ${f({ x: 1 })} process.cwd() b`;'),
		).toEqual([]);
	});

	it('keeps the line count of what it blanks', () => {
		const text = "/* a\nb */\nconst s = 'x\\'y';\n`t\n`";
		expect(codeOnly(text).split('\n')).toHaveLength(
			text.split('\n').length,
		);
	});
});
