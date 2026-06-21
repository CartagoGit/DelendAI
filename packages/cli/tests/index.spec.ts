import { describe, expect, it } from 'vitest';

import { runHumanCli } from '../src/index';

describe('runHumanCli', () => {
	it('prints the version', async () => {
		const writes: string[] = [];
		const original = process.stdout.write;
		process.stdout.write = ((chunk: string) => {
			writes.push(chunk);
			return true;
		}) as typeof process.stdout.write;
		try {
			await expect(
				runHumanCli(['--version'], process.cwd()),
			).resolves.toBe(0);
			expect(writes.join('')).toBe('0.1.0\n');
		} finally {
			process.stdout.write = original;
		}
	});

	it('prints help with important commands', async () => {
		const writes: string[] = [];
		const original = process.stdout.write;
		process.stdout.write = ((chunk: string) => {
			writes.push(chunk);
			return true;
		}) as typeof process.stdout.write;
		try {
			await expect(runHumanCli(['--help'], process.cwd())).resolves.toBe(
				0,
			);
			expect(writes.join('')).toContain('overview');
			expect(writes.join('')).toContain('plugin list');
			expect(writes.join('')).toContain('config doctor');
		} finally {
			process.stdout.write = original;
		}
	});
});
