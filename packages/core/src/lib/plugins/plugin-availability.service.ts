/**
 * plugin-availability.service.ts — the one reading of whether a plugin
 * can work here, so the doctor, the overview and the configuration center
 * cannot tell three different stories.
 */
import type { IPluginAvailability } from '../contracts/interfaces/plugin-availability.interface';
import type { IMcpPlugin, IMcpPluginContext } from './plugin-contract';

/**
 * What `plugin` says about itself in `ctx`: `registered` when it does not
 * answer, and `degraded`, with the reason, when answering throws.
 */
export const availabilityOf = async (
	plugin: Pick<IMcpPlugin, 'availability'>,
	ctx: IMcpPluginContext,
): Promise<IPluginAvailability> => {
	if (plugin.availability === undefined) return { state: 'registered' };
	try {
		return await plugin.availability(ctx);
	} catch (error) {
		return {
			state: 'degraded',
			missing: error instanceof Error ? error.message : String(error),
		};
	}
};
