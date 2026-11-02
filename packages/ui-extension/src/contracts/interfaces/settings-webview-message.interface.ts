import type { IExtensionSettings } from '@delendai/client';

export type SettingsWebviewRequest =
	| {
			readonly command: 'save';
			readonly requestId: string;
			readonly settings: IExtensionSettings;
	  }
	| { readonly command: 'reset'; readonly requestId: string };

export type SettingsHostResponse =
	| {
			readonly command: 'settingsSaved';
			readonly requestId: string;
			readonly settings: IExtensionSettings;
	  }
	| {
			readonly command: 'settingsError';
			readonly requestId: string;
			readonly message?: string;
	  };
