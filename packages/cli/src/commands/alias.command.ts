/**
 * alias.command.ts — `delendai alias status|install|remove`.
 *
 * b00239 S2/S6: surfaces the alias provisioning as a CLI subcommand.
 * The actual work lives in `lib/alias/alias-manager.ts`; this is a
 * thin glue layer that maps CLI args to the IAliasIo and
 * IAliasEnvironment the manager needs.
 *
 * Pre-fix review (points 15-18): the previous incarnation used a
 * `fakeIo` stub that returned `false` from `exists`,
 * `undefined` from `read`, and was a no-op for `write` /
 * `remove`. Combined with `binDir: process.cwd()` and
 * `canonicalPath: ${cwd}/delendai`, the command would happily
 * report `state: 'created'` without ever touching the real
 * filesystem. The fix wires the command to the production
 * adapter and the real canonical-launch resolver.
 */

import type {
	IAliasEnvironment,
	IAliasIo,
} from '../contracts/interfaces/alias.interface';
import { EXIT_CODE } from '../contracts/constants/exit-code.constant';
import type {
	ICliCommand,
	ICliCommandContext,
	ICliCommandResult,
} from '../contracts/interfaces/cli-command.interface';
import { data } from '../lib/helpers/cli-command.helper';
import {
	installAlias,
	readAliasState,
	removeAlias,
} from '../lib/alias/alias-manager';
import {
	resolveCanonicalExecutable,
	type ICanonicalExecutableResolution,
} from '../lib/alias/canonical-path';
import { createNodeAliasIo } from '../lib/alias/io-real';

const DEFAULT_ALIAS = 'est';

const platform = (): 'win32' | 'posix' =>
	process.platform === 'win32' ? 'win32' : 'posix';

/**
 * The binDir override is taken from three sources, in order:
 *
 *   1. `ctx.globals.extraOptions?.alias?.binDir` — `--options-alias-bin-dir=<path>`
 *   2. `process.env.DELENDAI_ALIAS_BIN_DIR` — CI / sandbox escape hatch
 *   3. the directory the canonical binary currently lives in (from
 *      `resolveCanonicalExecutable()`) — package-manager convention
 *      (npm/bun install `./bin/` next to the binary).
 *
 * Coercing to a string keeps the surface resilient against callers
 * who pass an array or number via the loose `Record<string, unknown>`
 * extra-option shape.
 */
const resolveBinDir = (
	ctx: ICliCommandContext,
	launch: ICanonicalExecutableResolution,
): string => {
	const fromOptions = ctx.globals.extraOptions?.alias?.binDir;
	if (typeof fromOptions === 'string' && fromOptions.length > 0) {
		return fromOptions;
	}
	const fromEnv = process.env['DELENDAI_ALIAS_BIN_DIR'];
	if (typeof fromEnv === 'string' && fromEnv.length > 0) return fromEnv;
	return launch.binDir;
};

/**
 * Build the env the alias-manager consumes. Uses the resolver so
 * the canonical path is `argv[1]` (the binary the user actually
 * invoked) rather than a cwd-injected guess.
 *
 * `binDir` is overridable via the `--options-alias-bin-dir=…` flag
 * or the `DELENDAI_ALIAS_BIN_DIR` env var, both of which are
 * documented in `--help`.
 */
const envFromContext = (
	_ctx: ICliCommandContext,
): { env: IAliasEnvironment; launch: ICanonicalExecutableResolution } => {
	const launch = resolveCanonicalExecutable();
	const env: IAliasEnvironment = {
		platform: platform(),
		binDir: launch.binDir, // overwritten below if an override is present
		canonicalPath: launch.canonicalPath,
	};
	const override = ((): string | undefined => {
		const fromOptions = _ctx.globals.extraOptions?.alias?.binDir;
		if (typeof fromOptions === 'string' && fromOptions.length > 0) {
			return fromOptions;
		}
		const fromEnv = process.env['DELENDAI_ALIAS_BIN_DIR'];
		if (typeof fromEnv === 'string' && fromEnv.length > 0) return fromEnv;
		return undefined;
	})();
	if (override !== undefined) {
		return { env: { ...env, binDir: override }, launch };
	}
	return { env, launch };
};

const subcommand = (path: readonly string[]): string | undefined => {
	const rest = path.slice(1); // strip 'alias'
	return rest[0];
};

const renderStatus = (
	status: Awaited<ReturnType<typeof readAliasState>>,
): Record<string, unknown> => ({
	alias: status.alias,
	canonical: status.canonical,
	state: status.state,
	path: status.path,
	occupiedBy: status.occupiedBy,
});

/**
 * CLI command factory. The factory accepts an optional IAliasIo
 * and a launch-resolution callback so the vertical integration
 * test (`alias-command.integration.spec.ts`) can drive the
 * command end-to-end against a temp dir WITHOUT touching the
 * process binary path. Production code calls `aliasCommand` with
 * no args and gets the real-fs adapter.
 */
export const createAliasCommand = (
	options?: Readonly<{
		readonly io?: IAliasIo;
		readonly resolveLaunch?: () => ICanonicalExecutableResolution;
	}>,
): ICliCommand => {
	const io = options?.io ?? createNodeAliasIo();
	const resolveLaunch = options?.resolveLaunch ?? resolveCanonicalExecutable;

	return {
		name: 'alias',
		summary:
			'Provision the `est` human alias for the canonical `delendai` CLI.',
		usage:
			'alias [status|install|remove]  [--options-alias-bin-dir=<path>]',
		async run(
			path: readonly string[],
			ctx: ICliCommandContext,
		): Promise<ICliCommandResult> {
			const alias = DEFAULT_ALIAS;
			const { env } = ((): {
				env: IAliasEnvironment;
				launch: ICanonicalExecutableResolution;
			} => {
				const launch = resolveLaunch();
				const e: IAliasEnvironment = {
					platform: platform(),
					binDir: launch.binDir,
					canonicalPath: launch.canonicalPath,
				};
				const override = resolveBinDir(ctx, launch);
				if (override !== launch.binDir) {
					return { env: { ...e, binDir: override }, launch };
				}
				return { env: e, launch };
			})();
			const sub = subcommand(path);
			if (sub === undefined || sub === 'status') {
				const status = await readAliasState(alias, env, io);
				return data(renderStatus(status));
			}
			if (sub === 'install') {
				const outcome = await installAlias(alias, env, io);
				return data({
					action: outcome.action,
					status: renderStatus(outcome.status),
					detail: outcome.detail,
				});
			}
			if (sub === 'remove') {
				const outcome = await removeAlias(alias, env, io);
				return data({
					action: outcome.action,
					status: renderStatus(outcome.status),
					detail: outcome.detail,
				});
			}
			return {
				code: EXIT_CODE.USAGE,
				error: `unknown alias subcommand: ${String(sub)}`,
			};
		},
	};
};

export const aliasCommand: ICliCommand = createAliasCommand();
