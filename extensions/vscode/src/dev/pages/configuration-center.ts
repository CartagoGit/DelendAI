import { buildConfigurationCenterModel } from '../../../../../packages/ui-extension/src/configuration-center/configuration-center-model';
import { renderConfigurationCenter } from '../../../../../packages/ui-extension/src/configuration-center/render-configuration-center';
import type { IConfigurationCenterSource } from '../../../../../packages/ui-extension/src/contracts/interfaces/configuration-center.interface';

import { configurationCenterStringsByLang } from '../../i18n/configuration-center.strings';
import type { IPage } from './contract';

interface IConfigurationHost {
	post(message: unknown): void;
}

declare global {
	interface Window {
		__MCPV_CONFIGURATION_HOST__?: IConfigurationHost;
	}
}

/**
 * Parse the rendered document ONCE, with the browser's own parser.
 *
 * Every step below used to be a regular expression over the HTML:
 * `<style[^>]*>…<\/style>`, `<body…>(…)<\/body>`, and a `<script…>`
 * strip. All three are wrong on inputs HTML allows — a `>` inside an
 * attribute value, a closing tag written `</script >` — and the last
 * one is the dangerous shape, because "remove the script tags with a
 * regex" is not sanitisation and reads like it is. `DOMParser` answers
 * the same three questions correctly and in one pass.
 */
const parseRendered = (html: string): Document =>
	new DOMParser().parseFromString(html, 'text/html');

const hoistStyles = (parsed: Document): void => {
	for (const stale of document.head.querySelectorAll(
		'style[data-configuration-center-hoisted]',
	)) {
		stale.remove();
	}
	for (const block of parsed.querySelectorAll('style')) {
		const style = document.createElement('style');
		style.setAttribute('data-configuration-center-hoisted', 'true');
		style.textContent = block.textContent;
		document.head.appendChild(style);
	}
};

const mountDocument = (
	root: HTMLElement,
	html: string,
	host: IConfigurationHost,
): void => {
	const parsed = parseRendered(html);
	hoistStyles(parsed);
	// The scripts are taken OUT of the tree before it is mounted and
	// re-created below: a `<script>` inserted through `innerHTML` never
	// executes, so the dev shell has always had to re-create them, and
	// leaving the originals in would only mount dead tags.
	const scripts = [...parsed.body.querySelectorAll('script')].map(
		(script) => script.textContent ?? '',
	);
	for (const script of parsed.body.querySelectorAll('script')) {
		script.remove();
	}
	root.replaceChildren(...parsed.body.childNodes);
	// The production document owns the whole webview viewport (`100vh`). In the
	// dev shell it lives below preview chrome, so bind it to the available page
	// slot or the sticky save bar lands one header-height below the viewport.
	const center = root.querySelector<HTMLElement>(
		'[data-delendai-configuration-center]',
	);
	if (center) center.style.height = '100%';
	window.__MCPV_CONFIGURATION_HOST__ = host;
	for (const source of scripts) {
		const script = document.createElement('script');
		script.textContent = source;
		root.appendChild(script);
	}
};

const fetchSource = async (): Promise<IConfigurationCenterSource> => {
	const response = await fetch('/api/configuration-center');
	const data = (await response.json()) as IConfigurationCenterSource & {
		readonly message?: string;
	};
	if (!response.ok)
		throw new Error(data.message ?? `HTTP ${response.status}`);
	return data;
};

export const createConfigurationCenterPage = (): IPage => ({
	id: 'configuration',
	label: 'configuration',
	async render(root, deps) {
		const render = async (): Promise<void> => {
			const source = await fetchSource();
			const strings = configurationCenterStringsByLang[deps.lang];
			const html = renderConfigurationCenter({
				model: buildConfigurationCenterModel({
					...source,
					copy: strings.copy,
				}),
				lang: deps.lang,
			});
			mountDocument(root, html, {
				post(message) {
					if (
						message !== null &&
						typeof message === 'object' &&
						(message as { command?: unknown }).command ===
							'discardConfiguration'
					) {
						void render();
						return;
					}
					void (async () => {
						const payload = message as {
							readonly expectedDigest?: unknown;
							readonly edits?: unknown;
						};
						const response = await fetch(
							'/api/configuration-center',
							{
								method: 'POST',
								headers: { 'Content-Type': 'application/json' },
								body: JSON.stringify({
									expectedDigest: payload.expectedDigest,
									edits: payload.edits,
								}),
							},
						);
						const result = (await response.json()) as {
							readonly ok?: boolean;
							readonly reason?: string;
							readonly document?: { readonly digest?: string };
						};
						window.dispatchEvent(
							new MessageEvent('message', {
								data:
									result.ok === true
										? {
												command: 'configurationSaved',
												digest: result.document?.digest,
											}
										: {
												command:
													result.reason === 'conflict'
														? 'configurationConflict'
														: 'configurationInvalid',
											},
							}),
						);
					})().catch(() => {
						window.dispatchEvent(
							new MessageEvent('message', {
								data: { command: 'configurationInvalid' },
							}),
						);
					});
				},
			});
		};
		await render();
	},
});
