import type { IPluginAvailability } from './plugin-availability.interface';

/** One plugin's last answer about whether it can work here, and when. */
export interface IPluginAvailabilityRecord extends IPluginAvailability {
	readonly plugin: string;
	/** When it was read (ISO 8601). */
	readonly readAt: string;
}
