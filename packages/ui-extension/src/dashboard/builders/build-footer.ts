import type { IDashboardAllModels } from '@mcp-vertex/client';
import type { ILangDict } from '@mcp-vertex/shared/i18n';
import { extensionText } from '../../i18n/extension-text';
import { escapeHtml } from '../format';

export function buildFooter(
	model: IDashboardAllModels,
	options: { readonly refreshCommand: string; readonly docsUrl: string },
	lang: ILangDict,
): string {
	const text = (key: string, vars?: Readonly<Record<string, string | number>>) =>
		extensionText(lang, key, vars);
	return `
	<footer class="mv-footer">
		<span>${escapeHtml(text('dashboard.footerRefresh'))}: <code>${escapeHtml(options.refreshCommand)}</code></span>
		<span class="mv-footer__sep">·</span>
		<span>${escapeHtml(text('dashboard.footerDocs'))}: <code>${escapeHtml(options.docsUrl)}</code></span>
		<span class="mv-footer__sep">·</span>
		<span>${escapeHtml(text('dashboard.footerFetched'))}: <code>${escapeHtml(model.server.fetchedAt)}</code></span>
	</footer>
`.trim();
}
