import { DEFAULT_DOCS_URL, validateDocsUrl } from './embed.service';
import type {
	IExtensionSettings,
	IExtensionSettingsPatch,
	ISettingsStore,
	ISettingsValidationResult,
} from '../contracts/interfaces/settings.interface';

export const DEFAULT_EXTENSION_SETTINGS: IExtensionSettings = {
	docsUrl: DEFAULT_DOCS_URL,
	allowLocalhost: false,
	allowPrivateIps: false,
	logLevel: 'info',
	theme: 'system',
};

const LOG_LEVELS = new Set(['debug', 'info', 'warn', 'error']);
const THEMES = new Set(['system', 'light', 'dark']);

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
	return { ok: issues.length === 0, issues };
};

export class SettingsService {
	constructor(private readonly store: ISettingsStore) {}

	async get(): Promise<IExtensionSettings> {
		const root = asRecord(await this.store.read());
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
			extension: {
				...asRecord(root.extension),
				...next,
			},
		});
		return next;
	}
}
