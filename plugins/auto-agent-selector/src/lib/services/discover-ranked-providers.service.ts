import { discoverRosterForTool } from '../discovery/real-deps';
import { resolveTaskPin } from '../prefs/resolve-task-pin';
import { resolveTradeoff } from './tradeoff.service';
import { rankProviders } from '../routing/rank-providers';
import type { IDiscoveryDeps } from '../contracts/interfaces/roster.interface';
import type {
	IRankInput,
	IRankedProvider,
} from '../contracts/interfaces/ranking.interface';
import type { IRosterSnapshotStore } from '../discovery/roster-store';

export const discoverRankedProviders = async (options: {
	readonly deps?: IDiscoveryDeps | undefined;
	readonly rosterStore?: IRosterSnapshotStore | undefined;
	readonly requestedTradeoff?: number | undefined;
	readonly defaultTradeoff: number;
	readonly pin?: string | undefined;
	readonly taskType?: string | undefined;
	readonly taskPins?: Readonly<Record<string, string>> | undefined;
	readonly calibration?: IRankInput['calibration'] | undefined;
}): Promise<{
	readonly roster: Awaited<ReturnType<typeof discoverRosterForTool>>;
	readonly tradeoff: number;
	readonly ranked: readonly IRankedProvider[];
}> => {
	const roster = await discoverRosterForTool(
		options.deps,
		options.rosterStore,
	);
	const tradeoff = resolveTradeoff(
		options.requestedTradeoff,
		options.defaultTradeoff,
	);
	const ranked = rankProviders({
		available: roster.available,
		costQualityTradeoff: tradeoff,
		pinnedId: resolveTaskPin(
			options.pin,
			options.taskType,
			options.taskPins,
		),
		...(options.calibration !== undefined
			? { calibration: options.calibration }
			: {}),
	});
	return { roster, tradeoff, ranked };
};
