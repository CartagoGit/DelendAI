/**
 * Canonical host preference catalogs. They live in the publishable client
 * contract so every renderer and host adapter consumes the same literal
 * unions without depending on a private application package.
 */
export const HOST_THEME_CHOICES = [
	'system',
	'light',
	'dark',
	'midnight',
	'solarized',
	'nord',
] as const;

export const HOST_LANGUAGE_CHOICES = [
	'ar',
	'de',
	'en',
	'es',
	'fr',
	'hi',
	'it',
	'ja',
	'pt',
	'th',
	'vi',
	'zh',
] as const;

export const HOST_MOTION_CHOICES = ['system', 'full', 'reduced'] as const;
export const HOST_LOG_LEVELS = ['debug', 'info', 'warn', 'error'] as const;

export type HostTheme = (typeof HOST_THEME_CHOICES)[number];
export type HostLanguage = (typeof HOST_LANGUAGE_CHOICES)[number];
export type HostMotion = (typeof HOST_MOTION_CHOICES)[number];
export type HostLogLevel = (typeof HOST_LOG_LEVELS)[number];

/** Preferences owned by the current UI host, never by project config. */
export interface IHostPreferences {
	readonly theme: HostTheme;
	readonly language: HostLanguage;
	readonly motion: HostMotion;
}

export interface IExtensionSettings extends IHostPreferences {
	readonly docsUrl: string;
	readonly allowLocalhost: boolean;
	readonly allowPrivateIps: boolean;
	readonly logLevel: HostLogLevel;
}

export type IExtensionSettingsPatch = Partial<IExtensionSettings>;

export interface ISettingsStore {
	/** Read the adapter-owned host preference envelope. */
	read(): Promise<unknown>;
	/** Write the complete adapter-owned host preference envelope. */
	write(value: unknown): Promise<void>;
}

export interface ISettingsValidationResult {
	readonly ok: boolean;
	readonly issues: readonly string[];
}

/** Versioned wire/storage envelope. Project configuration is deliberately absent. */
export interface IStoredExtensionSettings {
	readonly version: 2;
	readonly extension: IExtensionSettings;
}
