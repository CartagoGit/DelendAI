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

const hoistStyles = (html: string): void => {
	for (const stale of document.head.querySelectorAll(
		'style[data-configuration-center-hoisted]',
	)) {
		stale.remove();
	}
	for (const block of html.match(/<style[^>]*>[\s\S]*?<\/style>/gi) ?? []) {
		const style = document.createElement('style');
		style.setAttribute('data-configuration-center-hoisted', 'true');
		style.textContent = block
			.replace(/^<style[^>]*>/i, '')
			.replace(/<\/style>$/i, '');
		document.head.appendChild(style);
	}
};

const mountDocument = (
	root: HTMLElement,
	html: string,
	host: IConfigurationHost,
): void => {
	hoistStyles(html);
	const body = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i)?.[1] ?? html;
	const scripts = body.match(/<script[^>]*>[\s\S]*?<\/script>/gi) ?? [];
	root.innerHTML = body.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '');
	// The production document owns the whole webview viewport (`100vh`). In the
	// dev shell it lives below preview chrome, so bind it to the available page
	// slot or the sticky save bar lands one header-height below the viewport.
	const center = root.querySelector<HTMLElement>(
		'[data-mcpv-configuration-center]',
	);
	if (center) center.style.height = '100%';
	window.__MCPV_CONFIGURATION_HOST__ = host;
	for (const block of scripts) {
		const script = document.createElement('script');
		script.textContent = block
			.replace(/^<script[^>]*>/i, '')
			.replace(/<\/script>$/i, '');
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
