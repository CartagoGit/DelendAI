import { describe, expect, it } from 'vitest';

import {
	DEFAULT_EXTENSION_SETTINGS,
	SettingsService,
	validateExtensionSettings,
} from '../../src/lib/services/settings.service';
import type { ISettingsStore } from '../../src/lib/contracts/interfaces/settings.interface';

const createStore = (
	initial: unknown = {},
): ISettingsStore & { value: unknown } => ({
	value: initial,
	async read() {
		return this.value;
	},
	async write(value) {
		this.value = value;
	},
});

describe('SettingsService', () => {
	it('returns defaults when no extension config exists', async () => {
		const service = new SettingsService(createStore({}));
		await expect(service.get()).resolves.toEqual(
			DEFAULT_EXTENSION_SETTINGS,
		);
	});

	it('merges a patch into the extension config', async () => {
		const store = createStore({ other: true });
		const service = new SettingsService(store);
		const next = await service.set({ theme: 'dark', logLevel: 'debug' });
		expect(next.theme).toBe('dark');
		expect(store.value).toEqual({
			other: true,
			extension: {
				...DEFAULT_EXTENSION_SETTINGS,
				logLevel: 'debug',
				theme: 'dark',
			},
		});
	});

	it('rejects invalid docs URLs before writing', async () => {
		const store = createStore({});
		const service = new SettingsService(store);
		await expect(
			service.set({ docsUrl: 'ftp://example.com' }),
		).rejects.toThrow(/https-required/);
		expect(store.value).toEqual({});
	});

	it('validates explicit settings', () => {
		expect(
			validateExtensionSettings({
				...DEFAULT_EXTENSION_SETTINGS,
				docsUrl: 'https://example.com',
			}).ok,
		).toBe(true);
	});
});
