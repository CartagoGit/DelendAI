import type {
	IKnownCommand,
	ISystemProfile,
	IToolPresence,
} from '@delendai/core/lib/contracts/interfaces/system-profile.interface';
import { crossOsMountPrefixesFor } from '@delendai/core/lib/platform/system-profile.helper';

const ALL_COMMANDS: readonly IKnownCommand[] = [
	'bun',
	'node',
	'npm',
	'pnpm',
	'fnm',
	'rg',
	'fd',
	'jq',
	'git',
];

/**
 * Build a fully synthetic `ISystemProfile`. Every command listed in
 * `present` is available and nothing else is, so a test states exactly
 * the machine it means and never inherits the one running the suite.
 */
export const syntheticProfile = (overrides: {
	readonly present: readonly IKnownCommand[];
	readonly isWsl?: boolean;
	readonly cpuCount?: number;
	readonly totalMemoryBytes?: number;
	readonly localeUsable?: boolean;
	readonly nodeNeedsFnmEnv?: boolean;
}): ISystemProfile => {
	const present = new Set(overrides.present);
	const tools = Object.fromEntries(
		ALL_COMMANDS.map((bin): [IKnownCommand, IToolPresence] => [
			bin,
			present.has(bin)
				? { available: true, path: `/usr/bin/${bin}` }
				: { available: false },
		]),
	) as Record<IKnownCommand, IToolPresence>;
	const isWsl = overrides.isWsl ?? false;
	const localeUsable = overrides.localeUsable ?? true;
	return {
		os: 'linux',
		isWsl,
		cpuCount: overrides.cpuCount ?? 8,
		totalMemoryBytes: overrides.totalMemoryBytes ?? 16 * 1024 * 1024 * 1024,
		tools,
		nodeNeedsFnmEnv: overrides.nodeNeedsFnmEnv ?? false,
		locale: localeUsable
			? { requested: 'C.UTF-8', usable: true, reason: 'generated' }
			: {
					requested: 'en_US.UTF-8',
					usable: false,
					reason: 'en_US.UTF-8 is requested but not generated here.',
				},
		crossOsMountPrefixes: crossOsMountPrefixesFor(isWsl),
		detectedAt: '2026-09-03T00:00:00.000Z',
	};
};
