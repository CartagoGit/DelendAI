/**
 * `renderKnowledgeNavigator` — IDE-agnostic HTML for the
 * Knowledge navigator webview (f126 S3b). Pure function, no host
 * imports. Renders a category-grouped list of knowledge entries
 * with a search box and an in-place preview pane for the selected
 * entry. The body is rendered as plain text (Markdown subset is
 * out of scope for v3; the server returns plain text bodies).
 */
import type {
	IKnowledgeListEntry,
	IKnowledgeFullEntry,
} from '@mcp-vertex/client';
import type { ILangDict } from '@mcp-vertex/shared/i18n';

import { escapeHtml } from '../dashboard/format';
import { extensionText } from '../i18n/extension-text';
import { renderComponentCssTokenRootCss } from '../styles/component-css';

export interface IRenderKnowledgeNavigatorOptions {
	readonly onOpenEntry: string; // command id for clicking an entry
	readonly onSearch: string; // command id for the search box (informational)
	readonly lang: ILangDict;
	readonly categories: Readonly<
		Record<string, readonly IKnowledgeListEntry[]>
	>;
	readonly preview?: IKnowledgeFullEntry | undefined;
}

const CLIENT_SCRIPT = `
(function () {
  'use strict';
  // FIX (K1): VS Code only allows a single acquireVsCodeApi() per
  // webview session. We must capture it ONCE here and close over
  // the reference, otherwise the second click throws
  // "An instance of the VS Code API has already been acquired".
  const vscode = (typeof window.acquireVsCodeApi === 'function')
    ? window.acquireVsCodeApi()
    : null;

  const search = document.getElementById('mcpv-kn-search');
  if (search) {
    search.addEventListener('input', () => {
      const q = (search.value || '').toLowerCase();
      document.querySelectorAll('.mcpv-kn-entry').forEach((el) => {
        const text = (el.getAttribute('data-search') || '').toLowerCase();
        const cat = el.closest('.mcpv-kn-category');
        if (!cat) return;
        const visible = text.includes(q);
        el.style.display = visible ? '' : 'none';
        // Show / hide category headers when all children are hidden.
        const any = Array.from(cat.querySelectorAll('.mcpv-kn-entry')).some(
          (e) => e.style.display !== 'none',
        );
        cat.style.display = any ? '' : 'none';
      });
    });
  }

  // FIX (K4): replaced the inline onclick dispatching a CustomEvent
  // nobody listened to with a delegated click handler. Single event
  // listener, single vscode.postMessage path.
  document.addEventListener('click', (e) => {
    const a = e.target && e.target.closest && e.target.closest('a[data-entry]');
    if (!a) return;
    e.preventDefault();
    const id = a.getAttribute('data-entry');
    if (vscode && id) vscode.postMessage({ command: 'openEntry', id });
  });

  // FIX (K3): the previous handler rebuilt the preview by concatenating
  // msg.entry.title / msg.entry.id into innerHTML — an XSS vector for
  // any knowledge entry whose title or id contains HTML. We now build
  // the preview DOM via createElement + textContent so every user
  // string is rendered as text, never parsed as HTML.
  window.addEventListener('message', (e) => {
    const msg = e && e.data;
    if (!msg || msg.command !== 'preview' || !msg.entry) return;
    const preview = document.querySelector('.mcpv-kn-preview');
    if (!preview) return;

    // Reset classes & content (the preview pane is rebuilt every time).
    preview.classList.remove('mcpv-kn-preview--empty');
    while (preview.firstChild) preview.removeChild(preview.firstChild);

    const header = document.createElement('header');
    const h2 = document.createElement('h2');
    h2.textContent = msg.entry.title || '';
    const code = document.createElement('code');
    code.textContent = msg.entry.id || '';
    header.appendChild(h2);
    header.appendChild(code);

    const pre = document.createElement('pre');
    pre.textContent = msg.entry.body || '';

    preview.appendChild(header);
    preview.appendChild(pre);
  });
})();
`.trim();

const renderCategory = (
	category: string,
	entries: readonly IKnowledgeListEntry[],
	_onOpenEntry: string,
): string => {
	const rows = entries
		.map((e) => {
			const data = `${e.id} ${e.title} ${category}`;
			return `<li class="mcpv-kn-entry" data-search="${escapeHtml(data)}">
				<a href="#" data-entry="${escapeHtml(e.id)}" data-title="${escapeHtml(e.title)}">
					<code>${escapeHtml(e.id)}</code>
					<span class="mcpv-kn-title">${escapeHtml(e.title)}</span>
				</a>
			</li>`;
		})
		.join('');
	return `<section class="mcpv-kn-category" data-category="${escapeHtml(category)}">
		<h3 class="mcpv-kn-cat">${escapeHtml(category)} <span class="mcpv-kn-count">${entries.length}</span></h3>
		<ul class="mcpv-kn-list">${rows}</ul>
	</section>`;
};

const renderPreview = (
	entry: IKnowledgeFullEntry | undefined,
	lang: ILangDict,
): string => {
	if (entry === undefined) {
		return `<aside class="mcpv-kn-preview mcpv-kn-preview--empty">
			<p>${escapeHtml(extensionText(lang, 'knowledge.previewEmpty'))}</p>
		</aside>`;
	}
	return `<aside class="mcpv-kn-preview">
		<header>
			<h2>${escapeHtml(entry.title)}</h2>
			<code>${escapeHtml(entry.id)}</code>
		</header>
		<pre>${escapeHtml(entry.body)}</pre>
	</aside>`;
};

export const renderKnowledgeNavigator = (
	options: IRenderKnowledgeNavigatorOptions,
): string => {
	const text = (key: string) => extensionText(options.lang, key);
	const categories = Object.entries(options.categories).sort(([a], [b]) =>
		a.localeCompare(b),
	);
	const left = categories
		.map(([cat, entries]) =>
			renderCategory(cat, entries, options.onOpenEntry),
		)
		.join('');
	return `<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8" />
	<meta name="viewport" content="width=device-width, initial-scale=1.0" />
	<title>${escapeHtml(text('knowledge.title'))}</title>
	<style>
		${renderComponentCssTokenRootCss()}
		:root {
			--mcpv-fg: var(--mcpv-fg-primary);
			--mcpv-bg: var(--mcpv-bg-primary);
			--mcpv-border: var(--vscode-widget-border, #30363d);
			--mcpv-surface: var(--vscode-side-bar-background, #161b22);
			/* FIX (K5): --mcpv-brand-purple was undefined inside this
			   webview (only the shared componentCss defines it). The
			   .mcpv-kn-count badge now falls back to the brand hex
			   inline so the category counts render visibly even when
			   componentCss is not injected by the host. */
			--mcpv-brand-purple: #7c3aed;
			--mcpv-accent: var(--mcpv-brand-purple, #7c3aed);
		}
		* { box-sizing: border-box; }
		body {
			margin: 0;
			font-family: var(--vscode-font-family, system-ui);
			color: var(--mcpv-fg);
			background: var(--mcpv-bg);
			display: grid;
			grid-template-columns: 320px 1fr;
			grid-template-rows: 48px 1fr;
			height: 100vh;
		}
		header.mcpv-kn-top {
			grid-column: 1 / 3;
			display: flex;
			align-items: center;
			gap: 12px;
			padding: 0 16px;
			border-bottom: 1px solid var(--mcpv-border);
			background: var(--mcpv-surface);
		}
		header.mcpv-kn-top h1 {
			font-size: 13px;
			margin: 0;
			font-weight: 700;
		}
		header.mcpv-kn-top input {
			flex: 1;
			padding: 6px 10px;
			background: var(--mcpv-bg);
			color: var(--mcpv-fg);
			border: 1px solid var(--mcpv-border);
			border-radius: 4px;
			font: inherit;
		}
		aside.mcpv-kn-list-pane {
			overflow-y: auto;
			padding: 8px 12px;
			border-right: 1px solid var(--mcpv-border);
		}
		.mcpv-kn-category { margin: 0 0 16px; }
		.mcpv-kn-cat {
			font-size: 11px;
			text-transform: uppercase;
			letter-spacing: 0.06em;
			color: var(--mcpv-fg-muted, #8b949e);
			margin: 0 0 4px;
			display: flex;
			gap: 6px;
			align-items: center;
		}
		.mcpv-kn-count {
			font-size: 10px;
			padding: 0 6px;
			border-radius: 999px;
			background: var(--mcpv-accent);
			color: #fff;
		}
		.mcpv-kn-list { list-style: none; padding: 0; margin: 0; }
		.mcpv-kn-entry a {
			display: block;
			padding: 6px 8px;
			border-radius: 4px;
			color: var(--mcpv-fg);
			text-decoration: none;
		}
		.mcpv-kn-entry a:hover { background: var(--mcpv-surface); }
		.mcpv-kn-entry code {
			font-size: 10px;
			color: var(--mcpv-fg-muted, #8b949e);
			display: block;
		}
		.mcpv-kn-title { font-size: 12px; }
		.mcpv-kn-preview {
			overflow-y: auto;
			padding: 24px 32px;
		}
		.mcpv-kn-preview--empty { color: var(--mcpv-fg-muted, #8b949e); }
		.mcpv-kn-preview header { margin-bottom: 16px; }
		.mcpv-kn-preview h2 { margin: 0 0 4px; font-size: 18px; }
		.mcpv-kn-preview code {
			font-size: 11px;
			color: var(--mcpv-fg-muted, #8b949e);
		}
		.mcpv-kn-preview pre {
			white-space: pre-wrap;
			word-wrap: break-word;
			font-family: var(--vscode-editor-font-family, monospace);
			font-size: 12px;
			line-height: 1.6;
		}
	</style>
</head>
<body>
	<header class="mcpv-kn-top">
		<h1>${escapeHtml(text('knowledge.title'))}</h1>
		<input id="mcpv-kn-search" type="text" placeholder="${escapeHtml(text('knowledge.searchPlaceholder'))}" />
	</header>
	<aside class="mcpv-kn-list-pane">
		${left || `<p>${escapeHtml(text('knowledge.empty'))}</p>`}
	</aside>
	${renderPreview(options.preview, options.lang)}
	<script>${CLIENT_SCRIPT}</script>
</body>
</html>`;
};
