export interface IExtensionSettings {
	readonly docsUrl: string;
	readonly allowLocalhost: boolean;
	readonly allowPrivateIps: boolean;
	readonly logLevel: 'debug' | 'info' | 'warn' | 'error';
	readonly theme: 'system' | 'light' | 'dark';
}

export type IExtensionSettingsPatch = Partial<IExtensionSettings>;

export interface ISettingsStore {
	read(): Promise<unknown>;
	write(value: unknown): Promise<void>;
}

export interface ISettingsValidationResult {
	readonly ok: boolean;
	readonly issues: readonly string[];
}
