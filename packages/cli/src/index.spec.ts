/**
 * The CLI entry a person types, and the one every git hook re-enters.
 *
 * It had no spec of its own. The dispatch it performs — version, help,
 * an unknown command, and the decision to run a command WITHOUT starting
 * a server — is the part a mistake is most expensive in: `guard` runs
 * inside `pre-commit` on every commit, and a `guard` that opens an stdio
 * server there deadlocks against the git lock it was invoked under.
 */
import { execFileSync } from 'node:child_process';
import {
	existsSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { runEntry, runHumanCli } from './index';
import { CLI_VERSION } from './contracts/constants/version.constant';
import { EXIT_CODE } from './contracts/constants/exit-code.constant';

const captured = { out: '', err: '' };
const capture = (): void => {
	captured.out = '';
	captured.err = '';
	vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
		captured.out += String(chunk);
		return true;
	});
	vi.spyOn(process.stderr, 'write').mockImplementation((chunk) => {
		captured.err += String(chunk);
		return true;
	});
};

const roots: string[] = [];
afterEach(() => {
	vi.restoreAllMocks();
	for (const root of roots.splice(0)) {
		rmSync(root, { recursive: true, force: true });
	}
});

describe('runHumanCli', () => {
	it('prints the version and exits OK', async () => {
		capture();
		const code = await runHumanCli(['--version']);
		expect(code).toBe(EXIT_CODE.OK);
		expect(captured.out.trim()).toBe(CLI_VERSION);
	});

	it('prints help and exits OK', async () => {
		capture();
		const code = await runHumanCli(['--help']);
		expect(code).toBe(EXIT_CODE.OK);
		expect(captured.out.length).toBeGreaterThan(0);
	});

	it('names an unknown command and points at help, without starting a server', async () => {
		capture();
		const code = await runHumanCli(['definitely-not-a-command']);
		expect(code).toBe(EXIT_CODE.USAGE);
		expect(captured.err).toContain(
			'Unknown command: definitely-not-a-command',
		);
		expect(captured.err).toContain('--help');
	});

	it('runs an offline command against --workspace, not the process cwd', async () => {
		// a00061, pinned: `guard` is offline, so it gets a noop context
		// built from `parsed.globals.workspace`. Passing the raw cwd here
		// once made `init:default --workspace=<other>` bootstrap whatever
		// directory the command was typed in.
		const root = mkdtempSync(join(tmpdir(), 'cli-entry-'));
		roots.push(root);
		execFileSync('git', ['init', '-q'], { cwd: root });
		capture();
		const code = await runHumanCli([
			'guard',
			'status',
			`--workspace=${root}`,
		]);
		expect(code).toBe(EXIT_CODE.OK);
		expect(captured.err).toBe('');
	});

	it('writes the structured envelope on --json', async () => {
		// The stdout policy (a00087): `--json` always emits, even for a
		// command that printed its own human recap and asked to suppress
		// the default print.
		const root = mkdtempSync(join(tmpdir(), 'cli-entry-json-'));
		roots.push(root);
		execFileSync('git', ['init', '-q'], { cwd: root });
		capture();
		await runHumanCli(['guard', 'status', `--workspace=${root}`, '--json']);
		const parse = (): void => {
			JSON.parse(captured.out);
		};
		expect(parse).not.toThrow();
	});

	it('turns a throwing command into an exit code and a line on stderr', async () => {
		// The catch arm. Whatever a command does, the entry has to turn it
		// into an exit code — a CLI that propagates is a CLI that prints a
		// stack trace at somebody in the middle of a commit, because
		// `guard` is what every git hook re-enters.
		//
		// A directory that is not a git repository is enough: the guard
		// asks git where the hooks live, and git refuses.
		const notARepo = mkdtempSync(join(tmpdir(), 'cli-entry-plain-'));
		roots.push(notARepo);
		capture();
		const code = await runHumanCli([
			'guard',
			'status',
			`--workspace=${notARepo}`,
		]);
		expect(code).not.toBe(EXIT_CODE.OK);
		expect(captured.err.length).toBeGreaterThan(0);
		expect(captured.err).not.toContain('    at ');
	});
});

describe('runEntry — what the binary actually does', () => {
	it('starts the server for __serve, and reports the guard it found', async () => {
		// The boot sequence, which lived inside `if (import.meta.main)`
		// where no test could reach it — and which is exactly the code
		// x00591 exists to correct, because one of its steps was writing
		// to somebody else's repository.
		const root = mkdtempSync(join(tmpdir(), 'entry-serve-'));
		roots.push(root);
		execFileSync('git', ['init', '-q'], { cwd: root });
		writeFileSync(
			join(root, 'delendai.config.json'),
			'{ "development": { "profile": "shared-checkout-merge" } }',
		);
		const served: unknown[][] = [];
		const lines: string[] = [];

		const code = await runEntry(['__serve', '--preset=core'], root, {
			serve: (args, where) => served.push([args, where]),
			report: (line) => lines.push(line),
		});

		expect(code).toBeUndefined();
		expect(served).toHaveLength(1);
		expect(served[0]?.[1]).toBe(root);
		expect(lines.join('\n')).toContain('guard hooks');
		// And it did not install them on the way past.
		expect(existsSync(join(root, '.husky', 'pre-push'))).toBe(false);
	});

	it('runs a human command and hands back its exit code', async () => {
		capture();
		const root = mkdtempSync(join(tmpdir(), 'entry-human-'));
		roots.push(root);
		const code = await runEntry(['--version'], root, {
			serve: () => {
				throw new Error('no server for a human command');
			},
		});
		expect(code).toBe(EXIT_CODE.OK);
		expect(captured.out.trim()).toBe(CLI_VERSION);
	});

	it('does not migrate when the command is `guard`', async () => {
		// `guard` runs inside pre-commit and pre-push, with git holding
		// its locks. A migration there writes to the workspace mid-commit.
		const root = mkdtempSync(join(tmpdir(), 'entry-guard-'));
		roots.push(root);
		execFileSync('git', ['init', '-q'], { cwd: root });
		writeFileSync(join(root, 'mcp-vertex.config.json'), '{}');
		capture();
		await runEntry(['guard', 'status', `--workspace=${root}`], root);
		// Untouched: the legacy name is still there, unmigrated.
		expect(existsSync(join(root, 'mcp-vertex.config.json'))).toBe(true);
	});
});

describe('runEntry reports a workflow the project is not following (x00598)', () => {
	it('names the broken invariants on stderr, and writes nothing', async () => {
		// The checks existed in this repository's toolbox, reachable as
		// `bun run work:doctor` by somebody who already knew to run it.
		// Nobody ran it, which is why the last dozen breakages were found
		// by a person noticing a git graph.
		const root = mkdtempSync(join(tmpdir(), 'entry-doctor-'));
		roots.push(root);
		execFileSync('git', ['init', '-q', '-b', 'develop'], { cwd: root });
		writeFileSync(
			join(root, 'delendai.config.json'),
			'{ "development": { "profile": "shared-checkout-merge" } }',
		);
		writeFileSync(join(root, 'a.ts'), 'export const a = 1;\n');
		execFileSync('git', ['add', '-A'], { cwd: root });
		execFileSync(
			'git',
			[
				'-c',
				'user.email=t@t',
				'-c',
				'user.name=t',
				'commit',
				'-q',
				'-m',
				'base',
			],
			{ cwd: root },
		);
		// A modification the shared checkout must not be carrying.
		writeFileSync(join(root, 'a.ts'), 'export const a = 2;\n');

		const lines: string[] = [];
		await runEntry(['__serve'], root, {
			serve: () => undefined,
			report: (line) => lines.push(line),
		});

		const text = lines.join('\n');
		expect(text).toContain('work doctor');
		expect(text).toContain('checkout-clean');
		// Read-only: reporting is not repairing. Their file is exactly as
		// they left it, modification and all.
		expect(readFileSync(join(root, 'a.ts'), 'utf8')).toBe(
			'export const a = 2;\n',
		);
	});

	it('reports only what does not hold, never the promises it keeps', async () => {
		// A server that recites its own health on every start is a server
		// whose output gets ignored. Every invariant that holds is silent;
		// only the broken one is named.
		const root = mkdtempSync(join(tmpdir(), 'entry-doctor-ok-'));
		roots.push(root);
		execFileSync('git', ['init', '-q', '-b', 'develop'], { cwd: root });
		writeFileSync(
			join(root, 'delendai.config.json'),
			'{ "development": { "profile": "shared-checkout-merge" } }',
		);
		execFileSync('git', ['add', '-A'], { cwd: root });
		execFileSync(
			'git',
			[
				'-c',
				'user.email=t@t',
				'-c',
				'user.name=t',
				'commit',
				'-q',
				'-m',
				'base',
			],
			{ cwd: root },
		);

		writeFileSync(join(root, 'a.ts'), 'export const a = 2;\n');
		const lines: string[] = [];
		await runEntry(['__serve'], root, {
			serve: () => undefined,
			report: (line) => lines.push(line),
		});

		const text = lines.join('\n');
		expect(text).toContain('checkout-clean');
		// The six that hold say nothing at all.
		for (const quiet of [
			'checkout-anchored',
			'no-abandoned-work-refs',
			'publications-canonical',
			'candidates-hydrated',
			'no-leftover-worktrees',
			'no-remote-work-refs',
		]) {
			expect(text).not.toContain(quiet);
		}
	});
});
