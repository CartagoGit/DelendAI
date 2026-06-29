import {
	DEFAULT_EXTENSION_SETTINGS,
	type IExtensionSettings,
} from '@mcp-vertex/client';
import { describe, expect, it } from 'vitest';

import {
	ExtensionSettingsSchema,
	LogLevelSchema,
	ThemeSchema,
} from '../../src/settings/settings-schema';

describe('ExtensionSettingsSchema (f00062 S1)', () => {
	const valid: IExtensionSettings = {
		docsUrl: 'https://mcp-vertex.dev/docs',
		allowLocalhost: false,
		allowPrivateIps: false,
		logLevel: 'info',
		theme: 'system',
	};

	it('accepts the canonical DEFAULT_EXTENSION_SETTINGS shape', () => {
		const result = ExtensionSettingsSchema.safeParse(DEFAULT_EXTENSION_SETTINGS);
		expect(result.success).toBe(true);
	});

	it('accepts a hand-rolled full settings object', () => {
		const result = ExtensionSettingsSchema.safeParse(valid);
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data).toEqual(valid);
		}
	});

	it('rejects stringified booleans (H13 closure)', () => {
		const result = ExtensionSettingsSchema.safeParse({
			...valid,
			allowLocalhost: 'true',
			allowPrivateIps: 'false',
		});
		expect(result.success).toBe(false);
	});

	it('rejects invalid logLevel enum values', () => {
		const result = ExtensionSettingsSchema.safeParse({
			...valid,
			logLevel: 'verbose',
		});
		expect(result.success).toBe(false);
	});

	it('rejects invalid theme enum values', () => {
		const result = ExtensionSettingsSchema.safeParse({
			...valid,
			theme: 'high-contrast',
		});
		expect(result.success).toBe(false);
	});

	it('rejects non-URL docsUrl', () => {
		const result = ExtensionSettingsSchema.safeParse({
			...valid,
			docsUrl: 'not-a-url',
		});
		expect(result.success).toBe(false);
	});

	it('rejects empty docsUrl', () => {
		const result = ExtensionSettingsSchema.safeParse({
			...valid,
			docsUrl: '',
		});
		expect(result.success).toBe(false);
	});

	it('rejects payloads with missing fields', () => {
		const result = ExtensionSettingsSchema.safeParse({
			docsUrl: 'https://example.com',
			allowLocalhost: true,
		});
		expect(result.success).toBe(false);
	});

	it('rejects null and non-object payloads', () => {
		expect(ExtensionSettingsSchema.safeParse(null).success).toBe(false);
		expect(ExtensionSettingsSchema.safeParse(42).success).toBe(false);
		expect(ExtensionSettingsSchema.safeParse('hello').success).toBe(false);
	});

	it('LogLevelSchema matches the IExtensionSettings logLevel union', () => {
		for (const level of ['debug', 'info', 'warn', 'error'] as const) {
			expect(LogLevelSchema.safeParse(level).success).toBe(true);
		}
		expect(LogLevelSchema.safeParse('verbose').success).toBe(false);
	});

	it('ThemeSchema matches the IExtensionSettings theme union', () => {
		for (const theme of ['system', 'light', 'dark'] as const) {
			expect(ThemeSchema.safeParse(theme).success).toBe(true);
		}
		expect(ThemeSchema.safeParse('high-contrast').success).toBe(false);
	});
});
