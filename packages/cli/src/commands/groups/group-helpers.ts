/**
 * group-helpers.ts — shared argument/response helpers for CLI command
 * groups (f00046). Each `groups/<plugin>.ts` is a thin 1:1 delegation to
 * the matching MCP tools; these helpers keep the per-command code to the
 * flag→tool-input mapping without re-declaring the same `data`/arg
 * parsers in every file (DRY / single source of truth).
 */
import { EXIT_CODE } from '../../contracts/constants/exit-code.constant';
import type {
	ICliCommandContext,
	ICliCommandResult,
} from '../../contracts/interfaces/cli-command.interface';

/** Wrap a tool payload as a successful (or coded) CLI data result. */
export const data = (
	value: unknown,
	code: ICliCommandResult['code'] = EXIT_CODE.OK,
): ICliCommandResult => ({ code, data: value });

/**
 * Read a `--name=value` (inline) or `--name value` (spaced) scalar flag.
 * Returns `undefined` when the flag is absent.
 */
export const scalarArg = (
	args: readonly string[],
	name: string,
): string | undefined => {
	const inline = args.find((arg) => arg.startsWith(`--${name}=`));
	if (inline !== undefined) return inline.slice(name.length + 3);
	const index = args.indexOf(`--${name}`);
	return index >= 0 ? args[index + 1] : undefined;
};

/** True when a boolean `--name` flag is present. */
export const hasFlag = (args: readonly string[], name: string): boolean =>
	args.includes(`--${name}`);

/** First non-flag positional argument, or `undefined`. */
export const positionalArg = (args: readonly string[]): string | undefined =>
	args.find((arg) => !arg.startsWith('-'));

/** Parse a comma-separated `--name=a,b,c` flag into a string array. */
export const listArg = (
	args: readonly string[],
	name: string,
): readonly string[] | undefined => {
	const raw = scalarArg(args, name);
	if (raw === undefined) return undefined;
	return raw
		.split(',')
		.map((entry) => entry.trim())
		.filter((entry) => entry.length > 0);
};

/** Parse a `--name=N` flag into a finite number, or `undefined`. */
export const numberArg = (
	args: readonly string[],
	name: string,
): number | undefined => {
	const raw = scalarArg(args, name);
	if (raw === undefined) return undefined;
	const value = Number(raw);
	return Number.isFinite(value) ? value : undefined;
};

/** Delegate to a registered MCP tool through the CLI transport. */
export const request = <TOut>(
	ctx: ICliCommandContext,
	tool: string,
	args: object = {},
): Promise<TOut> => ctx.request<TOut>(tool, args);

/** A USAGE-coded error result with a one-line usage string. */
export const usage = (line: string): ICliCommandResult => ({
	code: EXIT_CODE.USAGE,
	error: `usage: ${line}`,
});
