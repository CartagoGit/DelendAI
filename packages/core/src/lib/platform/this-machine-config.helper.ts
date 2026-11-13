/**
 * this-machine-config.helper.ts — the machine, as the user-level config
 * migration needs to know it: home, platform, roaming data and the Windows
 * homes a WSL machine can see.
 */
import { homedir } from 'node:os';
import { dirname } from 'node:path';

import type { IUserConfigEnvironment } from '../contracts/interfaces/user-host-config.interface';
import { windowsAppDataUnderWsl } from './user-directories.helper';

export const thisMachineConfigEnvironment = (): IUserConfigEnvironment => ({
	home: homedir(),
	platform:
		process.platform === 'win32' || process.platform === 'darwin'
			? process.platform
			: 'linux',
	...(process.env.APPDATA === undefined
		? {}
		: { appData: process.env.APPDATA }),
	windowsHomes: windowsAppDataUnderWsl().map((dir) => dirname(dirname(dir))),
});
