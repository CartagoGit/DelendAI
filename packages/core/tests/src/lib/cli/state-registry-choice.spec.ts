/**
 * state-registry-choice.spec.ts — which state registry a boot uses, and
 * that the shadow driver is loaded only when the project asks for it.
 */
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, describe, expect, it } from 'vitest';

import {
	chooseStateRegistry,
	SHADOW_DRIVER_PACKAGE,
} from '@delendai/core/lib/cli/state-registry-choice';
import { CONFIG_FILE_SCHEMA } from '@delendai/core/lib/plugins/config-file-schema';

import type { IStateRegistry } from '@delendai/contracts/state';
import { defineInMemoryStateRegistry } from '@delendai/state';

const never = (): Promise<unknown> => {
	throw new Error('the shadow driver must not be loaded');
};

const cacheDirAbs = mkdtempSync(join(tmpdir(), 'state-choice-'));
const base = { injected: undefined, cacheDirAbs };

afterAll(() => rmSync(cacheDirAbs, { recursive: true, force: true }));

describe('chooseStateRegistry', () => {
	it('uses the registry it was handed, whatever the setting says', async () => {
		const injected = defineInMemoryStateRegistry({ clock: () => 0 });
		const chosen = await chooseStateRegistry({
			...base,
			injected,
			shadowEnabled: true,
			load: never,
		});
		expect(chosen).toBe(injected);
	});

	it('builds the in-memory engine and loads nothing by default', async () => {
		const chosen = await chooseStateRegistry({
			...base,
			shadowEnabled: false,
			load: never,
		});
		expect(chosen.diagnose()).toEqual([]);
	});

	it('runs the SQLite driver beside the in-memory one when asked', async () => {
		const seen: { path?: string; state?: string; loaded?: string } = {};
		const shadow = defineInMemoryStateRegistry({ clock: () => 0 });
		let facadeOf: { primary?: IStateRegistry; shadow?: IStateRegistry } =
			{};
		const facade = defineInMemoryStateRegistry({ clock: () => 0 });
		const chosen = await chooseStateRegistry({
			...base,
			shadowEnabled: true,
			load: (specifier) => {
				seen.loaded = specifier;
				return Promise.resolve({
					defineSqliteStateRegistry: (options: {
						path: string;
						lastKnownState?: string;
					}) => {
						seen.path = options.path;
						seen.state = options.lastKnownState;
						return shadow;
					},
					createRegistryFacade: (options: {
						primary: IStateRegistry;
						shadow: IStateRegistry;
					}) => {
						facadeOf = options;
						return facade;
					},
				});
			},
		});
		expect(seen.loaded).toBe(SHADOW_DRIVER_PACKAGE);
		expect(seen.path).toBe(join(cacheDirAbs, 'state', 'shadow.sqlite'));
		// The directory is there before the driver opens its file in it.
		expect(existsSync(join(cacheDirAbs, 'state'))).toBe(true);
		expect(seen.state).toBe('shadow');
		expect(chosen).toBe(facade);
		expect(facadeOf.shadow).toBe(shadow);
		expect(facadeOf.primary).not.toBe(shadow);
	});

	it('says so when the driver cannot be loaded, instead of going without', async () => {
		await expect(
			chooseStateRegistry({
				...base,
				shadowEnabled: true,
				load: () => Promise.reject(new Error('Cannot find bun:sqlite')),
			}),
		).rejects.toThrow(
			/state\.parity\.shadow\.enabled is set, but @delendai\/state-sqlite could not be loaded: Cannot find bun:sqlite/u,
		);
	});

	it('refuses a package that is not the driver', async () => {
		await expect(
			chooseStateRegistry({
				...base,
				shadowEnabled: true,
				load: () => Promise.resolve({ default: {} }),
			}),
		).rejects.toThrow(/does not export the driver and its facade/u);
	});
});

describe('the setting in the configuration file', () => {
	it('is optional, and accepted when declared', () => {
		expect(CONFIG_FILE_SCHEMA.safeParse({}).success).toBe(true);
		expect(
			CONFIG_FILE_SCHEMA.safeParse({
				state: { parity: { shadow: { enabled: true } } },
			}).success,
		).toBe(true);
	});

	it('rejects a key the state block does not have', () => {
		expect(
			CONFIG_FILE_SCHEMA.safeParse({
				state: { parity: { shadow: { enabled: true, path: 'x' } } },
			}).success,
		).toBe(false);
	});
});
