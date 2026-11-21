/**
 * user-directories.helper.ts — where this machine's applications keep
 * their per-user configuration: the one answer the install targets and
 * the editor-session reader share.
 *
 * Each used to derive the roots on its own from `process.platform`, and
 * only one of them looked at the Windows side of a WSL machine. Under
 * WSL, `init` wrote Claude Desktop's configuration into the Linux home,
 * where the Windows application never reads it.
 */
import { existsSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

/** Windows profiles that belong to no person. */
const SYSTEM_PROFILES: ReadonlySet<string> = new Set([
	'All Users',
	'Default',
	'Default User',
	'Public',
	'desktop.ini',
]);

/** The per-user configuration root of this platform. */
export const userConfigRoot = (ctx: {
	readonly home: string;
	readonly platform: string;
	readonly appData?: string | undefined;
	readonly xdgConfigHome?: string | undefined;
}): string =>
	ctx.platform === 'win32'
		? (ctx.appData ?? join(ctx.home, 'AppData', 'Roaming'))
		: ctx.platform === 'darwin'
			? join(ctx.home, 'Library', 'Application Support')
			: (ctx.xdgConfigHome ?? join(ctx.home, '.config'));

/** This machine's per-user configuration root, read from its environment. */
export const thisUserConfigRoot = (
	env: NodeJS.ProcessEnv = process.env,
): string =>
	userConfigRoot({
		home: homedir(),
		platform: process.platform,
		appData: env.APPDATA,
		xdgConfigHome: env.XDG_CONFIG_HOME,
	});

/**
 * The Windows users' `AppData/Roaming` seen from WSL, where the editors
 * and desktop applications that run on Windows keep their configuration.
 */
export const windowsAppDataUnderWsl = (
	usersRoot = '/mnt/c/Users',
): readonly string[] => {
	let users: readonly string[];
	try {
		users = readdirSync(usersRoot);
	} catch {
		return [];
	}
	return users
		.filter((user) => !SYSTEM_PROFILES.has(user))
		.map((user) => join(usersRoot, user, 'AppData', 'Roaming'))
		.filter((dir) => existsSync(dir));
};
