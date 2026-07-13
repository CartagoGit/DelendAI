import { DEFAULT_DOCS_URL, validateDocsUrl } from './embed.service';
import type {
	IExtensionSettings,
	IExtensionSettingsPatch,
	ISettingsStore,
	ISettingsValidationResult,
} from '../contracts/interfaces/settings.interface';
import {
	HOST_LANGUAGE_CHOICES,
	HOST_LOG_LEVELS,
	HOST_MOTION_CHOICES,
	HOST_THEME_CHOICES,
} from '../contracts/interfaces/settings.interface';

export const EXTENSION_SETTINGS_STORAGE_KEY = 'mcp-vertex.host-settings';
export const EXTENSION_SETTINGS_STORAGE_VERSION = 2 as const;

export const DEFAULT_EXTENSION_SETTINGS: IExtensionSettings = {
	docsUrl: DEFAULT_DOCS_URL,
	allowLocalhost: false,
	allowPrivateIps: false,
	logLevel: 'info',
	theme: 'system',
	language: 'en',
	motion: 'system',
};

const LOG_LEVELS = new Set<string>(HOST_LOG_LEVELS);
const THEMES = new Set<string>(HOST_THEME_CHOICES);
const LANGUAGES = new Set<string>(HOST_LANGUAGE_CHOICES);
const MOTION_CHOICES = new Set<string>(HOST_MOTION_CHOICES);

const asRecord = (value: unknown): Record<string, unknown> =>
	value !== null && typeof value === 'object'
		? (value as Record<string, unknown>)
		: {};

export const validateExtensionSettings = (
	settings: IExtensionSettings,
): ISettingsValidationResult => {
	const issues: string[] = [];
	const url = validateDocsUrl(settings.docsUrl, {
		allowLocalhost: settings.allowLocalhost,
		allowPrivateIps: settings.allowPrivateIps,
	});
	if (!url.ok) issues.push(url.reason ?? 'invalid-docs-url');
	if (!LOG_LEVELS.has(settings.logLevel)) {
		issues.push(`invalid logLevel: ${settings.logLevel}`);
	}
	if (!THEMES.has(settings.theme)) {
		issues.push(`invalid theme: ${settings.theme}`);
	}
	if (!LANGUAGES.has(settings.language)) {
		issues.push(`invalid language: ${settings.language}`);
	}
	if (!MOTION_CHOICES.has(settings.motion)) {
		issues.push(`invalid motion: ${settings.motion}`);
	}
	return { ok: issues.length === 0, issues };
};

export class SettingsService {
	constructor(private readonly store: ISettingsStore) {}

	async get(): Promise<IExtensionSettings> {
		const root = asRecord(await this.store.read());
		// v1 stores had no version and only three themes. Reading the same
		// extension object with per-field defaults is the explicit migration.
		const extension = asRecord(root.extension);
		return {
			docsUrl:
				typeof extension.docsUrl === 'string'
					? extension.docsUrl
					: DEFAULT_EXTENSION_SETTINGS.docsUrl,
			allowLocalhost:
				typeof extension.allowLocalhost === 'boolean'
					? extension.allowLocalhost
					: DEFAULT_EXTENSION_SETTINGS.allowLocalhost,
			allowPrivateIps:
				typeof extension.allowPrivateIps === 'boolean'
					? extension.allowPrivateIps
					: DEFAULT_EXTENSION_SETTINGS.allowPrivateIps,
			logLevel:
				typeof extension.logLevel === 'string' &&
				LOG_LEVELS.has(extension.logLevel)
					? (extension.logLevel as IExtensionSettings['logLevel'])
					: DEFAULT_EXTENSION_SETTINGS.logLevel,
			theme:
				typeof extension.theme === 'string' &&
				THEMES.has(extension.theme)
					? (extension.theme as IExtensionSettings['theme'])
					: DEFAULT_EXTENSION_SETTINGS.theme,
			language:
				typeof extension.language === 'string' &&
				LANGUAGES.has(extension.language)
					? (extension.language as IExtensionSettings['language'])
					: DEFAULT_EXTENSION_SETTINGS.language,
			motion:
				typeof extension.motion === 'string' &&
				MOTION_CHOICES.has(extension.motion)
					? (extension.motion as IExtensionSettings['motion'])
					: DEFAULT_EXTENSION_SETTINGS.motion,
		};
	}

	async set(patch: IExtensionSettingsPatch): Promise<IExtensionSettings> {
		const root = asRecord(await this.store.read());
		const current = await this.get();
		const next: IExtensionSettings = { ...current, ...patch };
		const validation = validateExtensionSettings(next);
		if (!validation.ok) {
			throw new Error(validation.issues.join('; '));
		}
		await this.store.write({
			...root,
			version: EXTENSION_SETTINGS_STORAGE_VERSION,
			extension: {
				...asRecord(root.extension),
				...next,
			},
		});
		return next;
	}
}
