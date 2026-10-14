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

/** How long a probe may take before the plugin is taken to be degraded. */
const PROBE_TIMEOUT_MS = 5000;

/**
 * What `plugin` says about itself in `ctx`, proved by its probe when it
 * has one and says nothing worse than `registered`.
 */
export const provenAvailabilityOf = async (
	plugin: Pick<IMcpPlugin, 'availability' | 'probe'>,
	ctx: IMcpPluginContext,
	now: () => Date = () => new Date(),
	timeoutMs: number = PROBE_TIMEOUT_MS,
): Promise<IPluginAvailability> => {
	const said = await availabilityOf(plugin, ctx);
	if (plugin.probe === undefined || said.state !== 'registered') return said;
	let timer: ReturnType<typeof setTimeout> | undefined;
	try {
		await Promise.race([
			Promise.resolve(plugin.probe(ctx)),
			new Promise<never>((_resolve, reject) => {
				timer = setTimeout(
					() =>
						reject(
							new Error(
								`its probe took over ${String(timeoutMs)} ms`,
							),
						),
					timeoutMs,
				);
			}),
		]);
		return { state: 'verified', verifiedAt: now().toISOString() };
	} catch (error) {
		return {
			state: 'degraded',
			missing: `its probe failed: ${error instanceof Error ? error.message : String(error)}`,
		};
	} finally {
		if (timer !== undefined) clearTimeout(timer);
	}
};
