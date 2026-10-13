import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { CONSUMED_GLOBAL_FLAGS } from '../contracts/constants/cli-global-flags.constant';
import { parseCliInvocation } from './parser.service';

describe('parseCliInvocation', async () => {
	it('parses globals before the command', async () => {
		const parsed = parseCliInvocation(
			['--workspace', 'repo', '--json', 'overview', '--full'],
			'/tmp',
		);
		expect(parsed.globals.workspace).toBe('/tmp/repo');
		expect(parsed.globals.json).toBe(true);
		expect(parsed.commandPath).toEqual(['overview']);
		expect(parsed.commandArgs).toEqual(['--full']);
	});

	it('lifts supported global flags after the command', async () => {
		const parsed = parseCliInvocation(
			['search', 'needle', '--plugins=search', '--max=5'],
			'/tmp',
		);
		expect(parsed.globals.plugins).toEqual(['search']);
		expect(parsed.commandArgs).toEqual(['needle', '--max=5']);
	});

	it('parses --options-<plugin>=<key>=<value> into globals.extraOptions', async () => {
		const parsed = parseCliInvocation(
			['init', '--options-audit=auditDir=docs/audits'],
			'/tmp',
		);
		expect(parsed.globals.extraOptions).toEqual({
			audit: { auditDir: 'docs/audits' },
		});
		expect(parsed.commandArgs).toEqual([]);
	});

	it('merges multiple --options-* flags by plugin and key', async () => {
		const parsed = parseCliInvocation(
			[
				'--options-audit=auditDir=docs/audits',
				'init',
				'--options-memory=maxNotes=500',
				'--options-audit=topActions=7',
			],
			'/tmp',
		);
		expect(parsed.globals.extraOptions).toEqual({
			audit: { auditDir: 'docs/audits', topActions: '7' },
			memory: { maxNotes: '500' },
		});
		expect(parsed.commandPath).toEqual(['init']);
		expect(parsed.commandArgs).toEqual([]);
	});

	// f00052 S3 — host-scoped --agent-worktree (tri-state)
	describe('--agent-worktree', () => {
		it('is undefined when the flag is absent', () => {
			const parsed = parseCliInvocation(['overview'], '/tmp');
			expect(parsed.globals.agentWorktree).toBeUndefined();
		});

		it('treats a bare --agent-worktree as true', () => {
			const parsed = parseCliInvocation(
				['--agent-worktree', 'overview'],
				'/tmp',
			);
			expect(parsed.globals.agentWorktree).toBe(true);
		});

		it('parses --agent-worktree=true', () => {
			const parsed = parseCliInvocation(
				['--agent-worktree=true', 'overview'],
				'/tmp',
			);
			expect(parsed.globals.agentWorktree).toBe(true);
		});

		it('parses --agent-worktree=false as false', () => {
			const parsed = parseCliInvocation(
				['--agent-worktree=false', 'overview'],
				'/tmp',
			);
			expect(parsed.globals.agentWorktree).toBe(false);
		});

		it('treats --no-agent-worktree as false', () => {
			const parsed = parseCliInvocation(
				['--no-agent-worktree', 'overview'],
				'/tmp',
			);
			expect(parsed.globals.agentWorktree).toBe(false);
		});
	});

	describe('a flag cannot reach Object.prototype', () => {
		/**
		 * `--options-<plugin>=<key>=<value>` indexes an object with two
		 * strings from the command line. On a plain `{}` the lookup for
		 * `__proto__` answers with the prototype instead of `undefined`,
		 * so the write that follows would land on every object in the
		 * process — including, for instance, the `isError` a tool result
		 * is checked for.
		 */
		const pollutionCanary = (): unknown =>
			(({}) as Record<string, unknown>).polluted;

		it('ignores a plugin id of __proto__ instead of writing through it', () => {
			parseCliInvocation(
				['--options-__proto__=polluted=yes', 'overview'],
				'/tmp',
			);

			expect(pollutionCanary()).toBeUndefined();
		});

		it('ignores an option key of __proto__', () => {
			const parsed = parseCliInvocation(
				['--options-memory=__proto__=yes', 'overview'],
				'/tmp',
			);

			expect(pollutionCanary()).toBeUndefined();
			expect(parsed.globals.extraOptions?.memory).toBeUndefined();
		});

		it('ignores constructor and prototype in either position', () => {
			const parsed = parseCliInvocation(
				[
					'--options-constructor=a=1',
					'--options-memory=prototype=1',
					'overview',
				],
				'/tmp',
			);

			expect(parsed.globals.extraOptions).toBeUndefined();
		});

		it('still passes an ordinary option through', () => {
			const parsed = parseCliInvocation(
				['--options-memory=maxEntries=10', 'overview'],
				'/tmp',
			);

			expect(parsed.globals.extraOptions?.memory).toEqual({
				maxEntries: '10',
			});
		});
	});
});

describe('a flag the parser consumes never reaches a command (x00705)', () => {
	it("is not read from any command's arguments", () => {
		const commands = join(import.meta.dirname, '..', 'commands');
		const sources = readdirSync(commands, { recursive: true })
			.map(String)
			.filter(
				(file) => file.endsWith('.ts') && !file.endsWith('.spec.ts'),
			);
		expect(sources.length).toBeGreaterThan(20);
		const flags = [...CONSUMED_GLOBAL_FLAGS].join('|');
		const reads = new RegExp(
			`\\w+\\(\\s*args,\\s*'(?:${flags})'|args\\.includes\\('--(?:${flags})[=']`,
			'u',
		);
		const offenders = sources.filter((file) =>
			reads.test(readFileSync(join(commands, file), 'utf8')),
		);
		expect(offenders).toEqual([]);
	});

	it("takes a command's --remote, --workspace and --json out of its arguments", () => {
		const parsed = parseCliInvocation(
			['work', 'publish', '--remote=up', '--workspace=/w', '--json=[1]'],
			'/cwd',
		);
		expect(parsed.commandArgs).toEqual(['publish']);
		expect(parsed.globals.remote).toBe('up');
	});
});
