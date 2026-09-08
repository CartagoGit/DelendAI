import type {
	IKnownCommand,
	ISystemProfile,
} from '@delendai/core/lib/contracts/interfaces/system-profile.interface';
/**
 * Build a fully synthetic `ISystemProfile`. Every command listed in
 * `present` is available and nothing else is, so a test states exactly
 * the machine it means and never inherits the one running the suite.
 */
export declare const syntheticProfile: (overrides: {
	readonly present: readonly IKnownCommand[];
	readonly isWsl?: boolean;
	readonly cpuCount?: number;
	readonly totalMemoryBytes?: number;
	readonly localeUsable?: boolean;
	readonly nodeNeedsFnmEnv?: boolean;
}) => ISystemProfile;
