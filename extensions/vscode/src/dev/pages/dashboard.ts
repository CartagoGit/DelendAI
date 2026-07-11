/**
 * `extensions/vscode/src/dev/pages/dashboard.ts` —
 * dashboard view, lazily loaded.
 *
 * On render the page decides between the welcome screen
 * (when the workspace is unconfigured) and the full dashboard
 * (when configured) based on the `status` dep the
 * orchestrator hands in. The welcome screen is itself a
 * sub-page — its renderer and CSS come from
 * `@mcp-vertex/shared/components/dev/welcome` and are pulled
 * in via a second dynamic import so the welcome renderer is
 * only fetched when an unconfigured workspace is detected.
 *
 * Why split the welcome path from the dashboard path:
 *   - Most users have a configured workspace and will never
 *     see the welcome screen. Loading the welcome renderer
 *     (and its CSS) on every first paint wastes bandwidth.
 *   - When the welcome is shown, the dashboard renderer is
 *     not needed; skipping it keeps the page bundle small.
 */
// `mockDashboardModel` is intentionally imported from the
// source path (not via the `@mcp-vertex/ui-extension/webview`
// barrel) — going through the barrel makes Bun.build with
// `splitting: true` emit the same binding twice when the
// dev entry also pulls in the package's own dev/entry.ts
// chain (Duplicate export at runtime). Direct import keeps
// the chunk merger happy.
import { mockDashboardModel } from '@mcp-vertex/ui-extension/dev/mock-model';
import { dictsByLang, type Lang } from '@mcp-vertex/shared/i18n';
import { ensureWizardStyles } from '../settings-panel';

import type { IPage } from './contract';

/**
 * `renderDashboard` returns a COMPLETE `<html>` document whose
 * component + dashboard CSS live in `<style>` blocks in its `<head>`.
 * The dev page mounts only the `<body>` into `#root`, so without this
 * the dashboard renders unstyled in the :5200 preview (the dev shell
 * only ships chrome CSS, not the dashboard component styles). Hoist
 * every rendered `<style>` block into the live document head, once —
 * idempotent so a language re-render replaces rather than duplicates.
 */
const hoistDashboardStyles = (renderedHtml: string): void => {
	const head =
		renderedHtml.match(/<head[^>]*>([\s\S]*?)<\/head>/i)?.[1] ?? '';
	const blocks = head.match(/<style[^>]*>[\s\S]*?<\/style>/gi) ?? [];
	for (const stale of Array.from(
		document.head.querySelectorAll('style[data-dashboard-hoisted]'),
	)) {
		stale.remove();
	}
	for (const block of blocks) {
		const css = block
			.replace(/^<style[^>]*>/i, '')
			.replace(/<\/style>$/i, '');
		const el = document.createElement('style');
		el.setAttribute('data-dashboard-hoisted', 'true');
		el.textContent = css;
		document.head.appendChild(el);
	}
};

/** Extract the `<body>` inner HTML and hoist the head `<style>` blocks. */
const bodyWithHoistedStyles = (renderedHtml: string): string => {
	hoistDashboardStyles(renderedHtml);
	return renderedHtml.match(/<body[^>]*>([\s\S]*?)<\/body>/i)?.[1] ?? '';
};

const fetchDashboardBody = async (lang: Lang): Promise<string | null> => {
	try {
		const res = await fetch('/api/dashboard');
		if (!res.ok) return null;
		const data = (await res.json()) as
			| { ok: true; model: unknown }
			| { ok: false; kind: string; message: string };
		if ('ok' in data && data.ok !== true) return null;
		const { renderDashboard } = await import(
			'@mcp-vertex/ui-extension/webview'
		);
		const html = renderDashboard(
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			data.model as any,
			{
				docsUrl: 'https://cartagogit.github.io/mcp-vertex/',
				refreshCommand: 'mcp-vertex.refresh',
				openDocsCommand: 'mcp-vertex.openDocs',
				lang: dictsByLang[lang],
			},
		);
		return bodyWithHoistedStyles(html);
	} catch {
		return null;
	}
};

const renderMockDashboardBody = async (
	lang: Lang,
): Promise<{ body: string; fallback: boolean }> => {
	const { renderDashboard } = await import(
		'@mcp-vertex/ui-extension/webview'
	);
	const html = renderDashboard(mockDashboardModel, {
		docsUrl: 'https://cartagogit.github.io/mcp-vertex/',
		refreshCommand: 'mcp-vertex.refresh',
		openDocsCommand: 'mcp-vertex.openDocs',
		lang: dictsByLang[lang],
	});
	return { body: bodyWithHoistedStyles(html), fallback: true };
};

export interface IDashboardPageOptions {
	readonly navigate: (id: 'settings' | 'dashboard') => Promise<void> | void;
}

export const createDashboardPage = (options: IDashboardPageOptions): IPage => ({
	id: 'dashboard',
	label: 'dashboard',
	async render(root, deps) {
		// Welcome sub-page: workspace is unconfigured or partial.
		if (deps.status && deps.status.kind !== 'configured') {
			ensureWizardStyles();
			// Lazy-load the welcome renderer the first time the
			// unconfigured path is taken. Cached after that.
			const { renderFirstRunScreen } = await import(
				'@mcp-vertex/shared/components/dev/welcome'
			);
			const devDict = dictsByLang[deps.lang]?.dev;
			root.innerHTML = renderFirstRunScreen(
				devDict?.firstRunInstall ??
					'Install mcp-vertex in this workspace',
				{
					heading: devDict?.firstRunHeading,
					ledeHtml: devDict?.firstRunLede,
					skipLabel: devDict?.firstRunSkip,
				},
			);
			const installBtn =
				root.querySelector<HTMLButtonElement>('#welcome-install');
			installBtn?.addEventListener('click', () => {
				void options.navigate('settings');
			});
			const skipBtn =
				root.querySelector<HTMLButtonElement>('#welcome-skip');
			skipBtn?.addEventListener('click', () => {
				void options.navigate('dashboard');
			});
			return;
		}

		// Configured: fetch the live dashboard body. Lazy-load
		// the quick-start menu renderer (separate concern: it
		// has its own sessionStorage helpers).
		const real = await fetchDashboardBody(deps.lang);
		const { isQuickStartDismissed, renderQuickStartMenu } = await import(
			'@mcp-vertex/shared/components/dev/welcome'
		);
		const devDict = dictsByLang[deps.lang]?.dev;
		const fragments: string[] = [];
		if (!isQuickStartDismissed())
			fragments.push(
				renderQuickStartMenu(
					devDict
						? {
								dict: {
									heading: devDict.quickStartHeading,
									lede: devDict.quickStartLede,
									dismissLabel: devDict.quickStartDismiss,
								},
							}
						: {},
				),
			);

		let usedFallback = false;
		if (real) {
			fragments.push(real);
		} else {
			const mock = await renderMockDashboardBody(deps.lang);
			usedFallback = mock.fallback;
			fragments.push(mock.body);
		}

		root.innerHTML = fragments.join('\n');

		// Bind the quickstart dismiss button.
		const { dismissQuickStart } = await import(
			'@mcp-vertex/shared/components/dev/welcome'
		);
		root.querySelector<HTMLButtonElement>(
			'#quickstart-dismiss',
		)?.addEventListener('click', () => {
			dismissQuickStart();
			root.querySelector('.quickstart')?.remove();
		});

		// Surface the MCP-unreachable warning.
		if (usedFallback) {
			const note = document.createElement('p');
			note.className = 'mcpv-banner banner--warn';
			note.style.margin = '0';
			note.textContent =
				'MCP server unreachable. Showing mock data — start `bun run mcp-vertex` and click Refresh.';
			const quickstart = root.querySelector('.quickstart');
			quickstart
				? quickstart.insertAdjacentElement('afterend', note)
				: root.prepend(note);
		}
	},
});
