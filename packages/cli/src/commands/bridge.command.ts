/**
 * bridge.command.ts — `delendai bridge status|install|remove`.
 *
 * b00239 S3: surfaces the workspace-local legacy bridge as a CLI
 * subcommand. The actual work lives in `lib/bridge/bridge-installer.ts`;
 * this is a thin glue layer that maps CLI args to the `IBridgeIo`
 * and `IBridgeEnvironment` the installer needs.
 *
 * ## Why this is a CLI subcommand, not a `bridges/` rule in the config
 *
 * `delendai init` already lets a workspace declare what it is. A
 * bridge, however, is one-shot setup that no project needs to repeat;
 * a config flag would re-install on every start (wasteful) and a
 * config-only install would not be discoverable from the help. The
 * subcommand keeps the install (rare), the status (idempotent), and
 * the remove (rare) on the same surface, so a project maintainer only
 * has to read three lines of `--help`.
 */

import { EXIT_CODE } from '../contracts/constants/exit-code.constant';
import type {
	ICliCommand,
	ICliCommandContext,
	ICliCommandResult,
} from '../contracts/interfaces/cli-command.interface';
import { data } from '../lib/helpers/cli-command.helper';
import type {
	IBridgeDirectoryOutcome,
	IBridgeDirectoryStatus,
	IBridgeEnvironment,
	IBridgeIo,
	IBridgeShimStatus,
} from '../contracts/interfaces/bridge.interface';
import {
	installBridgeDirectory,
	readBridgeDirectoryStatus,
	removeBridgeDirectory,
} from '../lib/bridge/bridge-installer';
import { createNodeBridgeIo } from '../lib/bridge/io-real';
import { CANONICAL_CLI_BIN } from '../contracts/constants/canonical-launch.constant';

/**
 * Resolve the bridge environment.
 *
 * The canonical binary name comes from `CANONICAL_CLI_BIN` (S1)
 * rather than hard-coded; that way a future rebrand that changes the
 * canonical name only has one string to edit. Workspace root is the
 * command's effective workspace (`ctx.globals.workspace`), which
 * defaults to `cwd` (parser.service.ts) but can be overridden with
 * `--workspace=<path>` — important for `bridge install` called
 * from CI against a checkout that is not the process's cwd.
 */
const envFromContext = (ctx: ICliCommandContext): IBridgeEnvironment => ({
	platform: process.platform === 'win32' ? 'win32' : 'posix',
	workspaceRoot: ctx.globals.workspace,
	canonical: CANONICAL_CLI_BIN,
});

const subcommand = (path: readonly string[]): string | undefined => {
	const rest = path.slice(1); // strip 'bridge'
	return rest[0];
};

const renderShimStatus = (shim: IBridgeShimStatus): Record<string, unknown> => {
	const base: Record<string, unknown> = {
		legacyName: shim.legacyName,
		state: shim.state,
		paths: [...shim.paths],
	};
	if (shim.occupiedBy !== undefined) {
		base.occupiedBy = shim.occupiedBy;
	}
	return base;
};

const renderStatus = (
	status: IBridgeDirectoryStatus,
): Record<string, unknown> => ({
	bridgeDir: status.bridgeDir,
	canonical: status.canonical,
	readmePresent: status.readmePresent,
	shims: status.shims.map(renderShimStatus),
});

const renderOutcome = (
	outcome: IBridgeDirectoryOutcome,
): Record<string, unknown> => {
	const out: Record<string, unknown> = {
		action: outcome.action,
		status: renderStatus(outcome.status),
		perShim: outcome.perShim.map((p) => ({
			legacyName: p.status.legacyName,
			action: p.action,
			...(p.detail !== undefined ? { detail: p.detail } : {}),
		})),
	};
	if (outcome.detail !== undefined) {
		out.detail = outcome.detail;
	}
	return out;
};

/**
 * CLI command factory. The factory accepts an optional `IBridgeIo`
 * and an environment factory so the integration test
 * (`bridge-command.integration.spec.ts`) can drive the command end-to-
 * end against a temp dir WITHOUT touching the process binary path.
 * Production code calls `bridgeCommand` with no args and gets the
 * real-fs adapter.
 */
export const createBridgeCommand = (
	options?: Readonly<{
		readonly io?: IBridgeIo;
		readonly envFactory?: (ctx: ICliCommandContext) => IBridgeEnvironment;
	}>,
): ICliCommand => {
	const io = options?.io ?? createNodeBridgeIo();
	const envFactory = options?.envFactory ?? envFromContext;

	return {
		name: 'bridge',
		summary:
			'Provision workspace-local shims for legacy bin names so older scripts and CI keep working without edits.',
		usage: 'bridge [status|install|remove]  [--workspace=<path>]',
		async run(
			path: readonly string[],
			ctx: ICliCommandContext,
		): Promise<ICliCommandResult> {
			const env = envFactory(ctx);
			const sub = subcommand(path);
			if (sub === undefined || sub === 'status') {
				const status = await readBridgeDirectoryStatus(env, io);
				return data(renderStatus(status));
			}
			if (sub === 'install') {
				const outcome = await installBridgeDirectory(env, io);
				return data(renderOutcome(outcome));
			}
			if (sub === 'remove') {
				const outcome = await removeBridgeDirectory(env, io);
				return data(renderOutcome(outcome));
			}
			return {
				code: EXIT_CODE.USAGE,
				error: `unknown bridge subcommand: ${String(sub)}`,
			};
		},
	};
};

export const bridgeCommand: ICliCommand = createBridgeCommand();
