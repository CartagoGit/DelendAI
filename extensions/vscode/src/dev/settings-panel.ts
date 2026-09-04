/**
 * `extensions/vscode/src/dev/settings-panel.ts` — the dev preview's
 * Settings panel. Hosts:
 *
 *   1. The setup wizard (always visible — clicking "Open setup"
 *      inside the dashboard navigates here).
 *   2. Theme picker (system / light / dark) — applies `data-theme` on
 *      <html> so the dashboard CSS takes over the `--vscode-*`
 *      fallbacks. Persisted to `localStorage` under `mcpv:dev:theme`.
 *   3. Language picker (the 12 i18n dicts already shipped via
 *      `@delendai/shared/i18n`). Persisted to `localStorage` under
 *      `mcpv:dev:lang`. When the dashboard re-renders, it picks the
 *      stored dict so every panel translates consistently.
 *
 * Persistence keys are deliberately namespaced `mcpv:dev:*` so they
 * don't collide with the production extension's `vscode.ExtensionContext
 * .globalState` keys (those use `mcpv:theme`, `mcpv:lang`, etc., without
 * the `dev` infix). When the production extension reads its own
 * globalState, those values are wired in `extension.ts`; the dev
 * preview reads `mcpv:dev:*` only.
 *
 * Why two separate key families? The dev preview is a BROWSER, not
 * the VS Code extension host. It cannot call `vscode.ExtensionContext
 * .globalState.get`. `localStorage` is the closest analogue that
 * survives a page reload and stays out of the host extension's
 * persistent state (which would otherwise leak dev-only choices
 * into a user's editor settings).
 */
import type { Lang, LangDictByLang } from '@delendai/shared/i18n';
import { dictsByLang, languages } from '@delendai/shared/i18n';
// Import through the wrapper module. Going through the
// wrapper (rather than the SCSS source directly) keeps the
// consumer's contract surface as `devPreviewCss` (the
// stable name) instead of `compiledCss` (the SCSS plugin's
// internal name). Bun.build with `splitting: true` may
// emit two `var devPreviewCss` bindings in the same chunk
// when multiple files in that chunk import the same
// wrapper — see commit message for the dedup history; the
// current shape holds because the `mcp-scss` plugin's
// namespace prevents Bun's built-in SCSS handler from
// shadowing the import and emitting a default export that
// would collide on re-export.
import { devPreviewCss } from '@delendai/shared/styles/dev-preview-css';
import { renderLangPicker } from '@delendai/shared/components/dev/lang-picker';
import {
	ALL_THEMES,
	renderThemePicker,
	type ThemeChoice,
} from '@delendai/shared/components/dev/theme-picker';
import {
	renderSetupWizard,
	renderStatusBanner,
} from '@delendai/shared/components/dev/setup-wizard';

/**
 * Wire shape for `/api/setup/status`. Mirrors the server-side
 * `ISetupStatus` in `tools/scripts/dev/api/setup-status.ts` — we
 * re-declare it here so the browser bundle does not pull in the
 * dev-server file (Node-only) just to read its types.
 */
export type WorkspaceKind = 'configured' | 'partial' | 'unconfigured';

export interface ISetupSignal {
	readonly id: 'mcp-json' | 'settings-server' | 'mcp-vertex-config';
	readonly present: boolean;
	readonly path: string;
	readonly detail?: string;
}

export interface ISetupStatus {
	readonly kind: WorkspaceKind;
	readonly signals: readonly ISetupSignal[];
	readonly nextStep: 'spawn-mcp' | 'install' | 'manual';
	readonly suggestion: string;
}

const THEME_KEY = 'mcpv:dev:theme';
const LANG_KEY = 'mcpv:dev:lang';

export type { ThemeChoice };

const _escapeHtml = (s: string): string =>
	s
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;');

const safeRead = (key: string): string | null => {
	try {
		return localStorage.getItem(key);
	} catch {
		return null;
	}
};

const safeWrite = (key: string, value: string): void => {
	try {
		localStorage.setItem(key, value);
	} catch {
		// localStorage disabled (private mode, etc.) — silently
		// skip. The picker still works for the current session.
	}
};

const isThemeChoice = (v: string | null): v is ThemeChoice =>
	v !== null && (ALL_THEMES as ReadonlyArray<string>).includes(v);

const isLang = (v: string | null): v is Lang =>
	typeof v === 'string' &&
	languages.some((entry) => 'code' in entry && entry.code === v);

/**
 * Detect the user's preferred UI language from the surrounding host,
 * falling back to `navigator.language` for the dev preview.
 *
 * Inside a real VS Code webview, `acquireVsCodeApi()` is injected by the
 * extension host and exposes `vscode.env.language` (e.g. `"es-ES"`).
 * The dev preview never gets that injection, so we fall back to the
 * browser's `navigator.language`.
 *
 * Resolution order:
 *   1. VS Code host language (if running inside a real webview).
 *   2. Browser `navigator.language` (if running in the dev preview).
 *   3. Exact match against the 12 supported codes → use it.
 *   4. Sub-tag match (e.g. `es` from `es-ES`) → use it.
 *   5. Nothing matches → `en`.
 */
const SUPPORTED_LANG_CODES = new Set<Lang>(
	languages.flatMap((entry) =>
		'code' in entry ? ([entry.code] as Lang[]) : [],
	),
);

export const detectHostLang = (): Lang => {
	let hostLocale = '';

	try {
		const api = (
			globalThis as {
				acquireVsCodeApi?: () => { env?: { language?: string } };
			}
		).acquireVsCodeApi;
		if (typeof api === 'function') {
			hostLocale = api().env?.language ?? '';
		}
	} catch {
		// `acquireVsCodeApi` exists but throws outside a webview;
		// fall through to navigator.
	}

	if (!hostLocale && typeof navigator !== 'undefined') {
		hostLocale = navigator.language ?? '';
	}

	if (!hostLocale) return 'en';

	const exact = hostLocale.toLowerCase();
	if (SUPPORTED_LANG_CODES.has(exact as Lang)) return exact as Lang;

	const primary = exact.split(/[-_]/)[0];
	if (primary && SUPPORTED_LANG_CODES.has(primary as Lang))
		return primary as Lang;

	return 'en';
};

export interface IPersistedPrefs {
	readonly theme: ThemeChoice;
	readonly lang: Lang;
}

export const readPersistedPrefs = (): IPersistedPrefs => {
	const storedTheme = safeRead(THEME_KEY);
	const storedLang = safeRead(LANG_KEY);
	const theme: ThemeChoice = isThemeChoice(storedTheme)
		? storedTheme
		: 'system';
	const lang: Lang = isLang(storedLang) ? storedLang : detectHostLang();
	return { theme, lang };
};

export const applyTheme = (theme: ThemeChoice): void => {
	const html = document.documentElement;
	if (theme === 'system') {
		html.removeAttribute('data-theme');
	} else {
		html.setAttribute('data-theme', theme);
	}
};

/**
 * Apply the user's chosen language to the document.
 *
 * Three DOM side-effects, all idempotent:
 *   - `<html lang>` so screen readers + browser features (e.g. spell
 *     check) pick up the right locale.
 *   - `<html dir>` for RTL-aware layout (only `ar` flips it today;
 *     if a future RTL language is added the `rtlLangs` array in
 *     `@delendai/shared/i18n/shared` is the source of truth).
 *   - the `lang` attribute on individual translatable elements
 *     that opt in via `data-mcpv-lang-aware` — useful for mixed
 *     snippets (e.g. an English `<code>` inside a Spanish paragraph).
 */
export const applyLang = (lang: Lang): void => {
	const html = document.documentElement;
	html.setAttribute('lang', lang);
	const rtlLangs = new Set<Lang>(['ar']);
	if (rtlLangs.has(lang)) {
		html.setAttribute('dir', 'rtl');
	} else {
		html.removeAttribute('dir');
	}
};

const persistTheme = (theme: ThemeChoice): void => {
	safeWrite(THEME_KEY, theme);
	applyTheme(theme);
};

const persistLang = (lang: Lang): void => {
	safeWrite(LANG_KEY, lang);
	applyLang(lang);
};

export const getDict = (lang: Lang): LangDictByLang[Lang] => dictsByLang[lang];

export interface ISettingsPanelHandlers {
	readonly onInstall: (button: HTMLButtonElement) => Promise<void> | void;
	readonly onRecheck: () => Promise<void> | void;
	readonly onLanguageChange: (lang: Lang) => void;
}

const renderWizard = (status: ISetupStatus): string =>
	renderSetupWizard({
		kind: status.kind,
		suggestion: status.suggestion,
		signals: status.signals,
	});

// f00102 S4.5 — theme + language pickers are now the shared
// `renderThemePicker` / `renderLangPicker` from
// `@delendai/shared/components/dev/...` so any future product
// surface (CLI init wizard, marketing-site settings, JetBrains
// extension) emits the same radios + select without a fork. The
// dev preview keeps its existing `.settings__*` markup by
// emitting both `mcpv-*` (new BEM) and `settings__*` (legacy) via
// the shared renderer's HTML, and the shared SCSS aliases the
// two trees together.
const renderThemePickerLocal = (current: ThemeChoice): string =>
	renderThemePicker({
		current,
		hint: 'Choose how the dashboard renders in the dev preview. In production, the extension inherits the host VS Code theme automatically; the explicit choice here wins inside this browser tab.',
	});

const renderLangPickerLocal = (current: Lang): string =>
	renderLangPicker({ current, inline: true });

const renderStatusBannerLocal = (status: ISetupStatus): string =>
	renderStatusBanner({
		kind: status.kind,
		suggestion: status.suggestion,
		signals: status.signals,
	});

/**
 * Render the Settings panel. Caller is responsible for injecting the
 * wizard CSS (`devPreviewCss`) once before this is called — typically
 * on first navigation to the Settings view.
 *
 * The setup wizard only renders when the workspace is **not**
 * configured. A configured workspace lands on Settings to manage
 * theme + language prefs — the wizard would be noise. This keeps
 * the page honest: a configured workspace sees only the banner +
 * preferences, an unconfigured one sees the full wizard to walk
 * through the missing files.
 */
export const renderSettingsPanel = (
	status: ISetupStatus,
	prefs: IPersistedPrefs,
): string => {
	const wizardHtml = status.kind === 'configured' ? '' : renderWizard(status);
	return `<section class="settings">
		${renderStatusBannerLocal(status)}
		${wizardHtml}
		<form class="settings__form" id="settings-form" autocomplete="off">
			${renderThemePickerLocal(prefs.theme)}
			${renderLangPickerLocal(prefs.lang)}
		</form>
	</section>`;
};

export const bindSettingsHandlers = (
	root: HTMLElement,
	_status: ISetupStatus,
	prefs: IPersistedPrefs,
	handlers: ISettingsPanelHandlers,
): void => {
	const install = root.querySelector<HTMLButtonElement>('#setup-install');
	const refresh = root.querySelector<HTMLButtonElement>('#setup-refresh');
	const statusSpan = root.querySelector<HTMLSpanElement>('#setup-status');

	install?.addEventListener('click', async () => {
		if (!statusSpan) return;
		statusSpan.textContent = 'Installing…';
		install.disabled = true;
		try {
			await handlers.onInstall(install);
		} finally {
			install.disabled = false;
		}
	});

	refresh?.addEventListener('click', () => {
		void handlers.onRecheck();
	});

	const themeInputs = root.querySelectorAll<HTMLInputElement>(
		'input[type="radio"][name="theme"]',
	);
	for (const input of themeInputs) {
		input.addEventListener('change', () => {
			const value = input.value;
			if (isThemeChoice(value)) {
				persistTheme(value);
				prefs = { ...prefs, theme: value };
			}
		});
	}

	const langSelect = root.querySelector<HTMLSelectElement>(
		'select[name="lang"]',
	);
	langSelect?.addEventListener('change', () => {
		const value = langSelect.value;
		if (isLang(value)) {
			persistLang(value);
			prefs = { ...prefs, lang: value };
			handlers.onLanguageChange(value);
		}
	});
};

/**
 * Apply the persisted theme on first paint. Idempotent — calling
 * with the same prefs is a no-op for the DOM (HTML attribute is set
 * unconditionally; that's the cheapest possible path).
 */
export const bootstrapPersistedPrefs = (): IPersistedPrefs => {
	// x00100 S2: `?lang=xx` is an explicit load-time override — persist it
	// so every page (they all read the persisted prefs) renders in that
	// language, exactly like a manual switch from the settings page.
	const urlLang = new URLSearchParams(window.location.search).get('lang');
	if (urlLang !== null && isLang(urlLang)) {
		safeWrite(LANG_KEY, urlLang);
	}
	const prefs = readPersistedPrefs();
	applyTheme(prefs.theme);
	applyLang(prefs.lang);
	// If the user has never picked a language (no `mcpv:dev:lang` stored),
	// we resolved to `detectHostLang()`; persist that so the next load
	// does not re-detect and a manual switch is a real, deliberate
	// override from this point on.
	if (safeRead(LANG_KEY) === null) {
		safeWrite(LANG_KEY, prefs.lang);
	}
	return prefs;
};

export const ensureWizardStyles = (): void => {
	if (document.head.querySelector('[data-mcpv-dev-wizard]')) return;
	const tag = document.createElement('style');
	tag.setAttribute('data-mcpv-dev-wizard', 'true');
	tag.textContent = devPreviewCss;
	document.head.appendChild(tag);
};

/**
 * Convenience: bundle the wizard + settings handlers into one entry
 * point so the caller doesn't repeat itself. Returns the rendered
 * HTML and wires up the events; expects the caller to drop it into
 * the #root element.
 */
export interface IInstallOutcome {
	readonly note: string;
}

export const mountSettingsPanel = (
	root: HTMLElement,
	status: ISetupStatus,
	prefs: IPersistedPrefs,
	installHandler: () => Promise<IInstallOutcome | null>,
	onLanguageChange: (lang: Lang) => void,
): { rerender: (status: ISetupStatus) => void; dispose: () => void } => {
	ensureWizardStyles();
	let mounted = true;
	let generation = 0;
	let statusTimer: number | undefined;
	const rerender = (next: ISetupStatus): void => {
		if (!mounted) return;
		generation += 1;
		const renderGeneration = generation;
		root.innerHTML = renderSettingsPanel(next, prefs);
		bindSettingsHandlers(root, next, prefs, {
			onInstall: async () => {
				const result = await installHandler();
				if (!mounted || renderGeneration !== generation) return;
				const statusSpan =
					root.querySelector<HTMLSpanElement>('#setup-status');
				if (statusSpan)
					statusSpan.textContent = result?.note ?? 'Done.';
				statusTimer = window.setTimeout(() => {
					void (async (): Promise<void> => {
						if (!mounted || renderGeneration !== generation) return;
						const r = await fetch(
							`/api/setup/status${window.location.search}`,
						);
						if (
							!r.ok ||
							!mounted ||
							renderGeneration !== generation
						)
							return;
						const nextStatus = (await r.json()) as ISetupStatus;
						if (!mounted || renderGeneration !== generation) return;
						rerender(nextStatus);
					})();
				}, 800);
			},
			onRecheck: async () => {
				const requestGeneration = generation;
				const r = await fetch(
					`/api/setup/status${window.location.search}`,
				);
				if (!r.ok || !mounted || requestGeneration !== generation)
					return;
				rerender((await r.json()) as ISetupStatus);
			},
			onLanguageChange,
		});
	};
	rerender(status);
	return {
		rerender,
		dispose: () => {
			mounted = false;
			generation += 1;
			if (statusTimer !== undefined) window.clearTimeout(statusTimer);
		},
	};
};
