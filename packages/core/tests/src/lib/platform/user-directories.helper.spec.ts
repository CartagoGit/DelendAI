/**
 * user-directories.helper.spec.ts — one answer for where applications
 * keep their per-user configuration, WSL's Windows side included.
 */
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { targetById } from '@delendai/core/cli';
import { isWslHere } from '@delendai/core/lib/platform/system-profile.helper';
import {
	userConfigRoot,
	windowsAppDataUnderWsl,
} from '@delendai/core/lib/platform/user-directories.helper';

describe('user directories', () => {
	const dirs: string[] = [];
	afterEach(() => {
		for (const dir of dirs.splice(0))
			rmSync(dir, { recursive: true, force: true });
	});

	it('gives each platform its own configuration root', () => {
		expect(userConfigRoot({ home: '/h', platform: 'linux' })).toBe(
			'/h/.config',
		);
		expect(
			userConfigRoot({
				home: '/h',
				platform: 'linux',
				xdgConfigHome: '/x',
			}),
		).toBe('/x');
		expect(userConfigRoot({ home: '/h', platform: 'darwin' })).toBe(
			'/h/Library/Application Support',
		);
		expect(
			userConfigRoot({
				home: 'C:/u',
				platform: 'win32',
				appData: 'C:/a',
			}),
		).toBe('C:/a');
	});

	it("lists the Windows people's AppData seen from WSL, without the system profiles", () => {
		const users = mkdtempSync(join(tmpdir(), 'wsl-users-'));
		dirs.push(users);
		for (const user of ['ana', 'Public', 'Default', 'nobody-yet'])
			mkdirSync(join(users, user), { recursive: true });
		for (const user of ['ana', 'Public'])
			mkdirSync(join(users, user, 'AppData', 'Roaming'), {
				recursive: true,
			});
		expect(windowsAppDataUnderWsl(users)).toEqual([
			join(users, 'ana', 'AppData', 'Roaming'),
		]);
		expect(windowsAppDataUnderWsl(join(users, 'missing'))).toEqual([]);
	});

	it('answers WSL the same way from the environment or from /proc/version', () => {
		expect(
			isWslHere({ WSL_DISTRO_NAME: 'Ubuntu' }, 'linux', () => ''),
		).toBe(true);
		expect(
			isWslHere({}, 'linux', () => 'Linux 6.1 microsoft-standard'),
		).toBe(true);
		expect(isWslHere({}, 'linux', () => undefined)).toBe(false);
		expect(
			isWslHere({ WSL_DISTRO_NAME: 'Ubuntu' }, 'darwin', () => ''),
		).toBe(false);
	});

	it("writes Claude Desktop's configuration where the Windows application reads it under WSL", () => {
		const target = targetById('claude-desktop');
		expect(
			target?.resolve({
				projectDir: '/p',
				home: '/home/me',
				platform: 'linux',
				isWsl: true,
				windowsAppData: ['/mnt/c/Users/me/AppData/Roaming'],
			}),
		).toBe(
			'/mnt/c/Users/me/AppData/Roaming/Claude/claude_desktop_config.json',
		);
		expect(
			target?.resolve({
				projectDir: '/p',
				home: '/home/me',
				platform: 'linux',
			}),
		).toBe('/home/me/.config/Claude/claude_desktop_config.json');
	});
});
