/**
 * state-registry-choice.ts — which state registry a boot uses.
 *
 * Three answers, in order: the one the host handed in; the in-memory
 * engine, which is what every boot got before; and, only when the
 * project sets `state.parity.shadow.enabled`, the in-memory engine with
 * the SQLite driver running beside it as a shadow, so its parity is
 * sampled against real work before it is ever trusted with it.
 *
 * Core may not import `bun:sqlite`, so the driver is loaded by name
 * through the caller's loader and only when asked for. A project that
 * asks for the shadow where it cannot load is told so: falling back to
 * the in-memory engine alone would leave a sampler with nothing to
 * sample and a setting that reads as on.
 */
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';

import type {
	IStateRegistry,
	IStateRegistryOptions,
} from '@delendai/contracts/state';
import { defineInMemoryStateRegistry } from '@delendai/state';

/** The package the shadow driver ships in. */
export const SHADOW_DRIVER_PACKAGE = '@delendai/state-sqlite';
/** Where the shadow store lives, under the cache. */
export const SHADOW_STORE_PATH = ['state', 'shadow.sqlite'] as const;

/** What this module needs of the shadow driver's package. */
interface IShadowDriverModule {
	readonly defineSqliteStateRegistry: (
		options: IStateRegistryOptions & {
			readonly path: string;
			readonly lastKnownState?: 'primary' | 'shadow' | 'both';
		},
	) => IStateRegistry;
	readonly createRegistryFacade: (options: {
		readonly primary: IStateRegistry;
		readonly shadow: IStateRegistry;
	}) => IStateRegistry;
}

const isShadowDriver = (loaded: unknown): loaded is IShadowDriverModule =>
	typeof loaded === 'object' &&
	loaded !== null &&
	typeof (loaded as Record<string, unknown>).defineSqliteStateRegistry ===
		'function' &&
	typeof (loaded as Record<string, unknown>).createRegistryFacade ===
		'function';

export const chooseStateRegistry = async (input: {
	readonly injected: IStateRegistry | undefined;
	readonly shadowEnabled: boolean;
	readonly cacheDirAbs: string;
	readonly load: (specifier: string) => Promise<unknown>;
	readonly clock?: () => number;
}): Promise<IStateRegistry> => {
	if (input.injected !== undefined) return input.injected;
	const clock = input.clock ?? (() => Date.now());
	const primary = defineInMemoryStateRegistry({ clock });
	if (!input.shadowEnabled) return primary;
	let loaded: unknown;
	try {
		loaded = await input.load(SHADOW_DRIVER_PACKAGE);
	} catch (error) {
		throw new Error(
			`state.parity.shadow.enabled is set, but ${SHADOW_DRIVER_PACKAGE} could not be loaded: ${
				error instanceof Error ? error.message : String(error)
			}. The SQLite driver runs under Bun only. Run under Bun with the package installed, or unset the setting.`,
		);
	}
	if (!isShadowDriver(loaded)) {
		throw new Error(
			`state.parity.shadow.enabled is set, but ${SHADOW_DRIVER_PACKAGE} does not export the driver and its facade. Install a version that does, or unset the setting.`,
		);
	}
	// The registry is chosen before the cache layout is laid out, and
	// SQLite does not create the directories above its file.
	const path = join(input.cacheDirAbs, ...SHADOW_STORE_PATH);
	mkdirSync(dirname(path), { recursive: true });
	return loaded.createRegistryFacade({
		primary,
		shadow: loaded.defineSqliteStateRegistry({
			clock,
			path,
			lastKnownState: 'shadow',
		}),
	});
};
