/**
 * alias.command.ts — `delendai alias status|install|remove`.
 *
 * b00239 S1: surfaces the alias provisioning as a CLI subcommand.
 * The actual work lives in `lib/alias/alias-manager.ts`; this is a
 * thin glue layer that maps CLI args to the IAliasIo and
 * IAliasEnvironment the manager needs.
 */

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

const DEFAULT_ALIAS = 'est';

const platform = (): 'win32' | 'posix' =>
	process.platform === 'win32' ? 'win32' : 'posix';

const fakeIo = (
	ctx: ICliCommandContext,
): {
	readonly join: (...parts: readonly string[]) => string;
	readonly exists: (path: string) => Promise<boolean>;
	readonly read: (path: string) => Promise<string | undefined>;
	readonly write: (path: string, contents: string) => Promise<void>;
	readonly remove: (path: string) => Promise<void>;
} => ({
	join: (...parts) => parts.join('/'),
	exists: async () => false,
	read: async () => undefined,
	write: async () => {},
	remove: async () => {},
});

const env = (alias: string, ctx: ICliCommandContext) => ({
	platform: platform(),
	binDir: process.cwd(),
	canonicalPath: `${process.cwd()}/delendai`,
});

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

export const aliasCommand: ICliCommand = {
	name: 'alias',
	summary:
		'Provision the `est` human alias for the canonical `delendai` CLI.',
	async run(
		path: readonly string[],
		ctx: ICliCommandContext,
	): Promise<ICliCommandResult> {
		const alias = DEFAULT_ALIAS;
		const io = fakeIo(ctx);
		const e = env(alias, ctx);
		const sub = subcommand(path);
		if (sub === undefined || sub === 'status') {
			const status = await readAliasState(alias, e, io);
			return data(renderStatus(status));
		}
		if (sub === 'install') {
			const outcome = await installAlias(alias, e, io);
			return data({
				action: outcome.action,
				status: renderStatus(outcome.status),
				detail: outcome.detail,
			});
		}
		if (sub === 'remove') {
			const outcome = await removeAlias(alias, e, io);
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
