import type { ICommandSet } from './command-set.interface';
import type { ICommandSetProvider } from './command-set-provider.interface';
import type { IPresetCommands } from './preset-commands.interface';
import type { IPresetConfigs } from './preset-configs.interface';
import type { IPresetConventions } from './preset-conventions.interface';
import type { IPresetIdentity } from './preset-identity.interface';
import type { IPresetToolchain } from './preset-toolchain.interface';

/**
 * Liskov Substitution: `IRulePreset` is *composed* (intersection)
 * of the 5 narrow preset contracts, not derived by inheritance.
 * Every preset IS-A each segment; no method-overriding surprises.
 *
 * Composition over inheritance is the deliberate choice so the
 * registry and the manifest writer can each depend on the narrowest
 * slice they need (`IPresetIdentity` for lookup, `IPresetConfigs`
 * for materialisation, `IPresetConventions` for `get_rules`,
 * `IPresetToolchain` for `check_rules`).
 */
export interface IRulePreset
	extends IPresetIdentity,
		IPresetConfigs,
		IPresetConventions,
		IPresetCommands,
		IPresetToolchain {}

/**
 * Re-exports so consumers that want to import "the preset
 * contracts" get everything from one place without re-declaring
 * the segments inline.
 */
export type {
	ICommandSet,
	ICommandSetProvider,
	IPresetCommands,
	IPresetConfigs,
	IPresetConventions,
	IPresetIdentity,
	IPresetToolchain,
};
