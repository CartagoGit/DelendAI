/**
 * command-flags.service.ts — a command's flags are the ones it declares
 * (x00721).
 *
 * Every command read its flags by name and ignored the rest, so a flag
 * spelled the way the tool's schema spells it (`--proposalId` for
 * `--proposal`) was dropped without a word and the command ran on the
 * whole backlog. `--help` after a command was dropped the same way, and
 * ran it.
 */
import {
	CONSUMED_GLOBAL_FLAGS,
	GLOBAL_FLAGS_WITH_VALUE,
} from '../contracts/constants/cli-global-flags.constant';
import { helpTranslationFor } from '../contracts/constants/help-translation.constant';
import type { ICliCommand } from '../contracts/interfaces/cli-command.interface';

/** Flags every command accepts: the global ones, wherever they appear. */
const EVERY_COMMAND_FLAGS: ReadonlySet<string> = new Set([
	...CONSUMED_GLOBAL_FLAGS,
	...GLOBAL_FLAGS_WITH_VALUE,
	'help',
	'agent-worktree',
	'no-agent-worktree',
]);

const nameOf = (token: string): string | undefined => {
	if (!token.startsWith('--') || token === '--') return undefined;
	const body = token.slice(2);
	const equals = body.indexOf('=');
	return equals === -1 ? body : body.slice(0, equals);
};

/** Whether `args` ask for this command's help rather than to run it. */
export const asksForHelp = (
	command: ICliCommand,
	args: readonly string[],
): boolean =>
	command.flags?.includes('help') !== true &&
	args.some((arg) => arg === '--help' || arg === '-h');

const comparable = (name: string): string =>
	name.toLowerCase().replace(/[-_]/gu, '');

/** The declared flag `name` most likely meant, if one is close enough. */
export const nearestFlag = (
	name: string,
	flags: readonly string[],
): string | undefined => {
	const wanted = comparable(name);
	return (
		flags.find((flag) => comparable(flag) === wanted) ??
		flags.find((flag) => wanted.startsWith(comparable(flag))) ??
		flags.find((flag) => comparable(flag).startsWith(wanted))
	);
};

/**
 * Why `args` cannot run `command`, or `undefined` when they can: a flag it
 * does not declare. Only a command that declares its flags is judged.
 */
export const unknownFlagRefusal = (
	command: ICliCommand,
	args: readonly string[],
): string | undefined => {
	const flags = command.flags;
	if (flags === undefined) return undefined;
	const unknown = [
		...new Set(
			args
				.map(nameOf)
				.filter(
					(name): name is string =>
						name !== undefined &&
						!flags.includes(name) &&
						!EVERY_COMMAND_FLAGS.has(name),
				),
		),
	];
	if (unknown.length === 0) return undefined;
	const lines = unknown.map((name) => {
		const meant = nearestFlag(name, flags);
		return meant === undefined
			? `\`${command.name}\` has no flag --${name}.`
			: `\`${command.name}\` has no flag --${name}; did you mean --${meant}?`;
	});
	return [
		...lines,
		`Its flags: ${flags.map((flag) => `--${flag}`).join(' ') || '(none)'}. Nothing ran.`,
	].join('\n');
};

/** `command`'s own help: what it does, how to call it, and its flags. */
export const renderCommandHelp = (command: ICliCommand, lang = 'en'): string =>
	[
		`delendai ${command.name}`,
		'',
		`  ${helpTranslationFor(lang).commandSummaries[command.name] ?? command.summary}`,
		'',
		`usage: delendai ${command.usage ?? command.name}`,
		...(command.flags === undefined || command.flags.length === 0
			? []
			: ['', 'flags:', ...command.flags.map((flag) => `  --${flag}`)]),
		'',
	].join('\n');
