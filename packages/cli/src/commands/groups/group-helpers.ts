/**
 * group-helpers.ts — single import site for command-group authors
 * (f00046). Each `groups/<plugin>.ts` is a thin 1:1 delegation to the
 * matching MCP tools; this module re-exports the shared base helpers
 * from `lib/cli-helpers.ts` plus the thin group-only extensions
 * (`positionalArg`, `listArg`, `numberArg`, `usage`) so every group
 * file keeps a single import statement.
 *
 * The shared base (`data`, `scalarArg`, `hasFlag`, `request`,
 * `isRecord`) lives in `lib/cli-helpers.ts` so non-group surfaces
 * (`commands/registry.ts`, the legacy `git.ts`) reuse the same code
 * without importing across layers.
 *
 * SOLID:
 *   - Single source of truth: every helper has exactly one definition.
 *   - Open/closed: adding a new helper means adding it to
 *     `cli-helpers.ts` and optionally re-exporting it here.
 *   - Interface segregation: each helper is a pure function with a
 *     minimal signature.
 */
import type { ICliCommandResult } from '../../contracts/interfaces/cli-command.interface';
import { EXIT_CODE } from '../../contracts/constants/exit-code.constant';
// `scalarArg` is imported as a value binding so the local
// `listArg` / `numberArg` definitions below can call it; the
// `export { … } from` re-exports the rest of the shared base in
// one statement (the re-export does NOT bring the symbols into
// scope for the body of this file, which is why we need the value
// import alongside it).
import { scalarArg } from '../../lib/cli-helpers.service';

export { data, hasFlag, isRecord, request } from '../../lib/cli-helpers.service';
// `scalarArg` is re-exported here so consumers get every base helper
// in a single import statement.
export { scalarArg };

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

/** A USAGE-coded error result with a one-line usage string. */
export const usage = (line: string): ICliCommandResult => ({
	code: EXIT_CODE.USAGE,
	error: `usage: ${line}`,
});
