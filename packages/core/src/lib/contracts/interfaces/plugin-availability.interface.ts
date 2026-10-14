import type { PLUGIN_AVAILABILITY_STATES } from '../constants/plugin-availability.constant';

export type IPluginAvailabilityState =
	(typeof PLUGIN_AVAILABILITY_STATES)[number];

/** What a plugin says about whether it can work in this project. */
export interface IPluginAvailability {
	readonly state: IPluginAvailabilityState;
	/** What is missing, in one line, when the state is not usable. */
	readonly missing?: string | undefined;
	/** The option to set or the command to run that fixes it. */
	readonly fix?: string | undefined;
	/** When its probe last passed (ISO 8601), for `verified`. */
	readonly verifiedAt?: string | undefined;
}
