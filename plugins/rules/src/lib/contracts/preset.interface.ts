import type { IPresetIdentity } from './preset-identity.interface';
import type { IPresetConfigs } from './preset-configs.interface';
import type { IPresetConventions } from './preset-conventions.interface';
import type { IPresetCommands } from './preset-commands.interface';
import type { IPresetToolchain } from './preset-toolchain.interface';

export type IRulePreset = IPresetIdentity &
	IPresetConfigs &
	IPresetConventions &
	IPresetCommands &
	IPresetToolchain;
