import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { registerAllCommands } from '../commands/registry';
import { workCommand } from '../commands/work.command';
import { REVIEW_COMMAND } from '../contracts/constants/review-command.constant';
import { WORK_COMMAND } from '../contracts/constants/work-command.constant';
import type { ICliCommand } from '../contracts/interfaces/cli-command.interface';
import {
	asksForHelp,
	nearestFlag,
	renderCommandHelp,
	unknownFlagRefusal,
} from './command-flags.service';

const command = (flags?: readonly string[]): ICliCommand => ({
	name: 'proposals review-queue',
	summary: 'The review backlog.',
	usage: 'proposals review-queue [--proposal=<id>]',
	...(flags === undefined ? {} : { flags }),
	run: async () => ({ code: 0 }),
});

describe('a command takes the flags it declares', () => {
	it('names the flag a caller most likely meant', () => {
		const flags = ['proposal', 'slice', 'base-branch', 'dry-run'];
		expect(nearestFlag('proposalId', flags)).toBe('proposal');
		expect(nearestFlag('baseBranch', flags)).toBe('base-branch');
		expect(nearestFlag('dry_run', flags)).toBe('dry-run');
		expect(nearestFlag('sl', flags)).toBe('slice');
		expect(nearestFlag('bogus', flags)).toBeUndefined();
	});

	it('refuses each undeclared flag once, and lists the ones it has', () => {
		const refusal = unknownFlagRefusal(command(['proposal', 'limit']), [
			'--proposalId=x1',
			'--proposalId',
			'x2',
			'--bogus',
		]);
		expect(refusal).toBe(
			[
				'`proposals review-queue` has no flag --proposalId; did you mean --proposal?',
				'`proposals review-queue` has no flag --bogus.',
				'Its flags: --proposal --limit. Nothing ran.',
			].join('\n'),
		);
	});

	it('accepts declared flags, global flags and positionals', () => {
		expect(
			unknownFlagRefusal(command(['proposal']), [
				'x00001',
				'--proposal=x1',
				'--json',
				'--workspace=/tmp',
				'--format',
				'json',
				'--',
			]),
		).toBeUndefined();
	});

	it('does not judge a command that declares no flags', () => {
		expect(unknownFlagRefusal(command(), ['--anything'])).toBeUndefined();
	});

	it('says a command with no flags has none', () => {
		expect(unknownFlagRefusal(command([]), ['--x'])).toContain(
			'Its flags: (none).',
		);
	});

	it('answers --help and -h, unless the command renders its own help', () => {
		expect(asksForHelp(command(['proposal']), ['--help'])).toBe(true);
		expect(asksForHelp(command(), ['-h'])).toBe(true);
		expect(asksForHelp(command(['proposal']), ['--proposal=x'])).toBe(
			false,
		);
		expect(asksForHelp(command(['help']), ['--help'])).toBe(false);
	});

	it('renders what the command does, its usage and its flags', () => {
		// A name with no translated summary, so the command's own shows.
		const demo = { ...command(['proposal', 'limit']), name: 'demo' };
		expect(renderCommandHelp(demo)).toBe(
			[
				'delendai demo',
				'',
				'  The review backlog.',
				'',
				'usage: delendai proposals review-queue [--proposal=<id>]',
				'',
				'flags:',
				'  --proposal',
				'  --limit',
				'',
			].join('\n'),
		);
		expect(renderCommandHelp({ ...command(), usage: undefined })).toContain(
			'usage: delendai proposals review-queue\n',
		);
	});
});

/** The flags a command's own `run` reads by name, from its source. */
const readsOf = (run: ICliCommand['run']): readonly string[] => [
	...new Set(
		[
			...run
				.toString()
				.matchAll(
					/(?:scalarArg|hasFlag|listArg|integerArg|numberArg|jsonArg)\(\s*args,\s*'([^']+)'/gu,
				),
		].map((match) => match[1] ?? ''),
	),
];

describe('a declaration matches what the command reads', () => {
	it('declares every flag each command reads', async () => {
		const commands = [...(await registerAllCommands()), workCommand];
		const undeclared = commands
			.filter((entry) => entry.flags !== undefined)
			.flatMap((entry) =>
				readsOf(entry.run)
					.filter((flag) => !entry.flags?.includes(flag))
					.map((flag) => `${entry.name}: --${flag}`),
			);
		expect(undeclared).toEqual([]);
	});

	it.each([
		// `work` runs the unit-of-work engine in core, one module per
		// operation.
		[
			'work',
			'../../../core/src/lib/work-units',
			/^work-unit.*\.ts$/u,
			WORK_COMMAND.flags,
		],
		['review', '.', /^review\.command\.ts$/u, REVIEW_COMMAND.flags],
	] as const)(
		'declares every flag `%s` reads anywhere in its module',
		(_name, dir, files, flags) => {
			// These commands read their flags in the helpers each subcommand
			// calls, out of sight of their `run`.
			const at = join(__dirname, '../commands', dir);
			const source = readdirSync(at)
				.filter((name) => files.test(name))
				.map((name) => readFileSync(join(at, name), 'utf8'))
				.join('\n');
			const read = new Set([
				...[
					...source.matchAll(
						/(?:scalarArg|hasFlag)\(\s*\w+,\s*'([^']+)'/gu,
					),
				].map((match) => match[1] ?? ''),
				...[...source.matchAll(/args\.includes\('--([^']+)'\)/gu)].map(
					(match) => match[1] ?? '',
				),
			]);
			const declared: readonly string[] = flags;
			expect(
				[...read].filter((flag) => !declared.includes(flag)),
			).toEqual([]);
			expect(read.size).toBeGreaterThan(2);
		},
	);

	it('declares the flags of the commands reviewers and implementers use', async () => {
		const commands = await registerAllCommands();
		const undeclared = commands
			.filter(
				(entry) =>
					entry.name === 'work' ||
					entry.name === 'review' ||
					entry.name.startsWith('proposals '),
			)
			.filter((entry) => entry.flags === undefined)
			.map((entry) => entry.name);
		expect(undeclared).toEqual([]);
	});
});
