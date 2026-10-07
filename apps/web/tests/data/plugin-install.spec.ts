import { describe, expect, it } from 'vitest';

import { packageManagers } from '#DATA/install';
import { PLUGIN_SLUGS } from '#DATA/plugin-catalog';
import {
	PLUGIN_INSTALL_PACKAGE,
	pluginInstallCommands,
	pluginServerArgs,
} from '#DATA/plugin-install';

/**
 * f00053 S4 — every plugin has a valid, derived install descriptor whose
 * package-manager set matches the canonical install matrix, with no
 * duplicated package-name literal.
 */
describe('plugin-install', () => {
	const pmIds = packageManagers.map((pm) => pm.id);

	it('every plugin has a command for the full package-manager set, in order', () => {
		for (const slug of PLUGIN_SLUGS) {
			const commands = pluginInstallCommands(slug);
			expect(
				commands.map((c) => c.pmId),
				`pm set mismatch for ${slug}`,
			).toEqual(pmIds);
		}
	});

	it('each command loads exactly this plugin via --plugins=<slug>', () => {
		for (const slug of PLUGIN_SLUGS) {
			for (const cmd of pluginInstallCommands(slug)) {
				expect(cmd.command).toContain(`--plugins=${slug}`);
				// Derived from the canonical package constant — never a
				// re-typed literal.
				expect(cmd.command).toContain(PLUGIN_INSTALL_PACKAGE);
			}
		}
	});

	it('pluginServerArgs ends with the --plugins flag for the plugin', () => {
		const npm = packageManagers[0];
		expect(npm).toBeDefined();
		const args = pluginServerArgs(npm, 'git');
		expect(args.at(-1)).toBe('--plugins=git');
	});

	it('does not invent a package manager outside the install matrix', () => {
		const fromPlugin = pluginInstallCommands('proposals').map(
			(c) => c.pmId,
		);
		expect(new Set(fromPlugin)).toEqual(new Set(pmIds));
	});
});
