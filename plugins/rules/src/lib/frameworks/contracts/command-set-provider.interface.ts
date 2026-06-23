import type { ICommandSet } from './command-set.interface';

/**
 * Dependency Inversion: every language family implements this
 * interface to produce per-area commands. The tools depend on the
 * interface, never on a concrete provider. Tests substitute a fake
 * provider that returns deterministic commands.
 */
export interface ICommandSetProvider {
	/**
	 * @param areaDir the area dir as resolved by the manifest
	 *                 (e.g. `''` for the root, `apps/web` for an app).
	 * @param rules   the manifest's per-area resolution
	 *                (linterConfigs, typecheckConfigs).
	 */
	buildCommandSet(
		areaDir: string,
		rules: Readonly<{
			readonly linterConfigs: readonly string[];
			readonly typecheckConfigs: readonly string[];
		}>,
	): ICommandSet;
}
