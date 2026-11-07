/**
 * work-print-path.spec.ts — `work enter --print-path` gives a script the
 * path or a non-zero exit, never an empty path and success.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

import { printPathOnly } from './work.command';

afterEach(() => {
	vi.restoreAllMocks();
});

const stdout = (): string[] => {
	const written: string[] = [];
	vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
		written.push(String(chunk));
		return true;
	});
	return written;
};

describe('printPathOnly', () => {
	it('prints the worktree alone and succeeds', () => {
		const written = stdout();
		const result = printPathOnly({
			code: 0,
			data: {
				path: '/repo/.cache/delendai/.worktrees/u',
				ref: 'refs/heads/x',
			},
		});
		expect(result).toEqual({ code: 0 });
		expect(written).toEqual(['/repo/.cache/delendai/.worktrees/u\n']);
	});

	it('passes a refusal through with its exit code, and prints nothing on stdout', () => {
		const written = stdout();
		const refusal = {
			code: 4 as const,
			error: 'reserved by your own unit',
		};
		expect(printPathOnly(refusal)).toBe(refusal);
		expect(written).toEqual([]);
	});

	it('fails a success that names no path, rather than hand a script an empty one', () => {
		const written = stdout();
		const result = printPathOnly({
			code: 0,
			data: { ref: 'refs/heads/x' },
		});
		expect(result.code).not.toBe(0);
		expect(written).toEqual([]);
	});
});
