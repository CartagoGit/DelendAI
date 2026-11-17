/**
 * The CLI entry's `migrate` command against a real repository: the guard
 * migrates before any other command, so `migrate status` and `--dry-run`
 * must run before it. It copies a repository and runs the command twice, so
 * it is an e2e spec, not a unit one.
 */
import { existsSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { createGitRepoTemplate } from '@delendai/test-kit';

import { runHumanCli } from './index';
import { EXIT_CODE } from './contracts/constants/exit-code.constant';

const plain = createGitRepoTemplate({ trunk: 'develop' });

let out = '';
const roots: string[] = [];

afterEach(() => {
	vi.restoreAllMocks();
	for (const root of roots.splice(0)) {
		rmSync(root, { recursive: true, force: true });
	}
});

describe('runHumanCli migrate', () => {
	it('[<540ms] lets `migrate status` and `--dry-run` look without migrating', async () => {
		// The guard migrates before any other command. Run before `migrate`,
		// it applied everything, and the dry run a person asked for had
		// nothing left to show.
		const root = plain.copy().root;
		roots.push(root);
		const legacy = join(root, 'mcp-vertex.config.json');
		writeFileSync(legacy, '{}\n');
		out = '';
		vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
			out += String(chunk);
			return true;
		});
		vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
		expect(
			await runHumanCli(['migrate', 'status', `--workspace=${root}`]),
		).toBe(EXIT_CODE.OK);
		expect(existsSync(legacy)).toBe(true);
		expect(existsSync(join(root, 'delendai.config.json'))).toBe(false);

		await runHumanCli(['migrate', '--dry-run', `--workspace=${root}`]);
		expect(existsSync(legacy)).toBe(true);
		expect(out).not.toContain('not-needed');
	});
});
