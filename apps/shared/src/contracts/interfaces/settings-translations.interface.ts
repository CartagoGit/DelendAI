export interface ISettingsTranslations {
	readonly title: string;
	readonly description: string;
	readonly docsUrl: string;
	readonly docsUrlDescription: string;
	readonly allowLocalhostDocsUrl: string;
	readonly allowLocalhostDocsUrlDescription: string;
	readonly allowPrivateIpsDocsUrl: string;
	readonly allowPrivateIpsDocsUrlDescription: string;
	readonly logLevel: string;
	readonly theme: string;
	readonly language: string;
	readonly motion: string;
	readonly save: string;
	readonly reset: string;
	readonly saving: string;
	readonly resetting: string;
	readonly saved: string;
	readonly resetToDefaults: string;
	readonly saveError: string;
	readonly resetError: string;
	readonly option: (
		group: 'logLevel' | 'theme' | 'motion' | 'language',
		value: string,
	) => string;
}
