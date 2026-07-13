import { describe, expect, it } from 'vitest';

import {
	DEFAULT_EXTENSION_SETTINGS,
	SettingsService,
	validateExtensionSettings,
} from '../../src/lib/services/settings.service';
import {
	HOST_THEME_CHOICES,
	type ISettingsStore,
} from '../../src/lib/contracts/interfaces/settings.interface';

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

describe('SettingsService', async () => {
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
			version: 2,
			extension: {
				...DEFAULT_EXTENSION_SETTINGS,
				logLevel: 'debug',
				theme: 'dark',
			},
		});
	});

	it('migrates legacy unversioned settings with explicit defaults', async () => {
		const store = createStore({
			extension: { theme: 'dark', language: 'unknown', motion: 'off' },
		});
		const service = new SettingsService(store);
		await expect(service.get()).resolves.toMatchObject({
			theme: 'dark',
			language: 'en',
			motion: 'system',
		});
		await service.set({ language: 'es', motion: 'reduced' });
		expect(store.value).toMatchObject({
			version: 2,
			extension: { language: 'es', motion: 'reduced' },
		});
	});

	it('accepts every canonical shared theme', async () => {
		const service = new SettingsService(createStore({}));
		for (const theme of HOST_THEME_CHOICES) {
			await expect(service.set({ theme })).resolves.toMatchObject({
				theme,
			});
		}
	});

	it('rejects invalid docs URLs before writing', async () => {
		const store = createStore({});
		const service = new SettingsService(store);
		await expect(
			service.set({ docsUrl: 'ftp://example.com' }),
		).rejects.toThrow(/https-required/);
		expect(store.value).toEqual({});
	});

	it('validates explicit settings', async () => {
		expect(
			validateExtensionSettings({
				...DEFAULT_EXTENSION_SETTINGS,
				docsUrl: 'https://example.com',
			}).ok,
		).toBe(true);
	});
});
