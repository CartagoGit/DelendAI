/**
 * user-config-paths.ts — where each agent host keeps its user-level config,
 * on Linux, macOS, WSL and Windows, read from what `AGENT_HOSTS` declares.
 *
 * Pure: the machine is described by the caller, nothing here touches it.
 */
import { AGENT_HOSTS } from '../../contracts/constants/agent-hosts.constant';
import type {
	IResolvedUserConfig,
	IResolvedUserConfigFile,
	IUserConfigEnvironment,
} from '../../contracts/interfaces/user-host-config.interface';

const join = (...parts: readonly string[]): string =>
	parts.join('/').replace(/\/{2,}/gu, '/');

const VSCODE_USER = 'Code/User';

/** The VS Code User directories on this machine, WSL's Windows ones included. */
export const vscodeUserDirectories = (
	env: IUserConfigEnvironment,
): readonly string[] => {
	const local =
		env.platform === 'win32'
			? env.appData === undefined
				? []
				: [join(env.appData, VSCODE_USER)]
			: env.platform === 'darwin'
				? [join(env.home, 'Library/Application Support', VSCODE_USER)]
				: [join(env.home, '.config', VSCODE_USER)];
	const windows = (env.windowsHomes ?? []).map((home) =>
		join(home, 'AppData/Roaming', VSCODE_USER),
	);
	return [...local, ...windows];
};

export const resolveUserConfigPaths = (
	env: IUserConfigEnvironment,
): IResolvedUserConfig => {
	const files: IResolvedUserConfigFile[] = [];
	const notCovered: string[] = [];
	for (const host of AGENT_HOSTS) {
		const declared = host.userConfig ?? [];
		if (declared.length === 0) notCovered.push(host.id);
		for (const file of declared) {
			const roots =
				file.location === 'home'
					? [env.home]
					: vscodeUserDirectories(env);
			for (const root of roots) {
				files.push({
					hostId: host.id,
					path: join(root, file.path),
					format: file.format,
				});
			}
		}
	}
	return { files, notCovered };
};
