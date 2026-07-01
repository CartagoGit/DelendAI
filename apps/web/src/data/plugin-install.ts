/**
 * plugin-install.ts — per-plugin install/run commands (f00053 S4).
 *
 * Every plugin can be loaded on its own with `--plugins=<slug>`. Rather
 * than re-spelling the package name or the per-package-manager invocation
 * (which already live in `install.ts`), this module DERIVES the per-plugin
 * commands from the canonical `packageManagers` / `ideTargets` matrix and
 * the `PACKAGE` / `SERVER_NAME` constants — so there is exactly one source
 * of truth and the per-plugin page never drifts from the core install page.
 */
import {
	PACKAGE,
	SERVER_NAME,
	type IIdeTarget,
	type IPackageManager,
	ideTargets,
	packageManagers,
} from '#DATA/install';

export interface IPluginRunCommand {
	/** Package-manager id (npm/pnpm/yarn/bun/deno) — matches install.ts. */
	readonly pmId: string;
	/** Display label (npm, pnpm, …). */
	readonly label: string;
	/** Full shell command that runs the server with only this plugin. */
	readonly command: string;
	readonly note?: string;
}

/**
 * The argv that runs the published server with only `slug` loaded — the
 * package-manager prefix + the package + the `--plugins=<slug>` flag.
 */
export const pluginServerArgs = (
	pm: IPackageManager,
	slug: string,
): readonly string[] => [...pm.args, `--plugins=${slug}`];

/** The full run-with-only-this-plugin command for one package manager. */
export const pluginRunCommand = (pm: IPackageManager, slug: string): string =>
	`${pm.command} ${pluginServerArgs(pm, slug).join(' ')}`;

/**
 * Per-package-manager run commands for one plugin, in the SAME order as
 * the core install matrix.
 */
export const pluginInstallCommands = (
	slug: string,
): readonly IPluginRunCommand[] =>
	packageManagers.map((pm) => ({
		pmId: pm.id,
		label: pm.label,
		command: pluginRunCommand(pm, slug),
		...(pm.note === undefined ? {} : { note: pm.note }),
	}));

/**
 * The MCP-config `args` array an IDE needs to load only this plugin,
 * derived from a package manager's invocation. Re-uses the same IDE
 * matrix (`ideTargets`) as the core install page.
 */
export const pluginIdeArgs = (
	pm: IPackageManager,
	slug: string,
): readonly string[] => [pm.command, ...pluginServerArgs(pm, slug)];

/** Re-exported so the component renders the same IDE matrix as install.ts. */
export const PLUGIN_IDE_TARGETS: readonly IIdeTarget[] = ideTargets;

/** The package + server name, surfaced for the component without re-literal. */
export const PLUGIN_INSTALL_PACKAGE = PACKAGE;
export const PLUGIN_INSTALL_SERVER_NAME = SERVER_NAME;
