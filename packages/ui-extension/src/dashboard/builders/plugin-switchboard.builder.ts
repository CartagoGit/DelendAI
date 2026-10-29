/** Pure activation payload → switchboard render-model mapper (f00107 S3). */
import type {
	IPluginActivationOverviewPayload,
	IPluginSwitchboardGroup,
	IPluginSwitchboardModel,
	IPluginSwitchboardRow,
	PluginSwitchboardBadge,
	PluginSwitchboardOrigin,
} from '../../contracts/interfaces/plugin-switchboard.interface';

const ORIGIN_ORDER: readonly PluginSwitchboardOrigin[] = [
	'bundled',
	'user-local',
	'external',
];

const BADGE_BY_ORIGIN: Readonly<
	Record<PluginSwitchboardOrigin, PluginSwitchboardBadge>
> = {
	bundled: 'ours',
	'user-local': 'yours',
	external: 'external',
};

export const buildPluginSwitchboardModel = (
	payload: IPluginActivationOverviewPayload | null | undefined,
): IPluginSwitchboardModel => {
	const entries = payload?.activationReport?.entries;
	if (entries === undefined) {
		return {
			kind: 'unavailable',
			hint: 'Activation introspection is unavailable. Restart with a core version that supports overview { activation: true }.',
		};
	}

	const rows: IPluginSwitchboardRow[] = entries.map((entry) => ({
		...entry,
		badge: BADGE_BY_ORIGIN[entry.origin],
		nextActive: !entry.active,
	}));
	const groups: IPluginSwitchboardGroup[] = ORIGIN_ORDER.map((origin) => ({
		origin,
		badge: BADGE_BY_ORIGIN[origin],
		rows: rows
			.filter((row) => row.origin === origin)
			.sort((a, b) => a.id.localeCompare(b.id)),
	})).filter((group) => group.rows.length > 0);

	return {
		kind: 'ready',
		groups,
		total: rows.length,
		active: rows.filter((row) => row.active).length,
	};
};
