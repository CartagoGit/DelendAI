import { execFileSync } from 'node:child_process';
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readdirSync,
	rmSync,
	writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { firstMissingDirectory, leaveNoTrace } from './leave-no-trace.service';

const ENTRY = resolve(__dirname, '../index.ts');

const folders: string[] = [];

const freshProject = (): string => {
	const dir = mkdtempSync(join(tmpdir(), 'leave-no-trace-'));
	folders.push(dir);
	execFileSync('git', ['init', '-q'], { cwd: dir });
	return dir;
};

/** Everything in the folder but git's own directory. */
const filesIn = (dir: string): readonly string[] =>
	readdirSync(dir, { recursive: true, encoding: 'utf8' }).filter(
		(path) => path !== '.git' && !path.startsWith(`.git/`),
	);

const run = (dir: string, args: readonly string[]): void => {
	const env = { ...process.env };
	delete env.CLAUDECODE;
	delete env.AI_AGENT;
	execFileSync('bun', [ENTRY, ...args], {
		cwd: dir,
		env,
		stdio: ['ignore', 'ignore', 'ignore'],
	});
};

afterEach(() => {
	for (const dir of folders.splice(0)) {
		rmSync(dir, { recursive: true, force: true });
	}
});

describe('leaveNoTrace', () => {
	it('removes the outermost directory the run created, and only that', () => {
		const dir = freshProject();
		const tidy = leaveNoTrace(dir);
		mkdirSync(join(dir, '.cache/delendai/logs'), { recursive: true });
		tidy();
		expect(existsSync(join(dir, '.cache'))).toBe(false);

		mkdirSync(join(dir, '.cache/other'), { recursive: true });
		const again = leaveNoTrace(dir);
		mkdirSync(join(dir, '.cache/delendai'), { recursive: true });
		again();
		expect(filesIn(dir)).toEqual(['.cache', '.cache/other']);
	});

	it('keeps a cache that was already there', () => {
		const dir = freshProject();
		mkdirSync(join(dir, '.cache/delendai'), { recursive: true });
		const tidy = leaveNoTrace(dir);
		writeFileSync(join(dir, '.cache/delendai/events.jsonl'), '{}\n');
		tidy();
		expect(existsSync(join(dir, '.cache/delendai/events.jsonl'))).toBe(
			true,
		);
	});

	it('never names the workspace or a directory outside it', () => {
		const dir = freshProject();
		expect(firstMissingDirectory(dir, dir)).toBeUndefined();
		expect(
			firstMissingDirectory(
				dir,
				join(tmpdir(), 'elsewhere-no-trace', 'x'),
			),
		).toBeUndefined();
	});
});

describe('read-only commands in a project with no cache', () => {
	it.each([['status'], ['overview'], ['adopt']])(
		'%s exits 0 and leaves no file behind',
		(command) => {
			const dir = freshProject();
			run(dir, [command]);
			expect(filesIn(dir)).toEqual([]);
		},
		60_000,
	);

	it('a project with its cache keeps what the run wrote', () => {
		const dir = freshProject();
		mkdirSync(join(dir, '.cache/delendai'), { recursive: true });
		run(dir, ['status']);
		expect(filesIn(dir).length).toBeGreaterThan(1);
	}, 60_000);
});
