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

import { escapeHtml } from '../dashboard/format';

export interface IRenderKnowledgeNavigatorOptions {
	readonly onOpenEntry: string; // command id for clicking an entry
	readonly onSearch: string; // command id for the search box (informational)
	readonly categories: Readonly<
		Record<string, readonly IKnowledgeListEntry[]>
	>;
	readonly preview?: IKnowledgeFullEntry | undefined;
}

const CLIENT_SCRIPT = `
(function () {
  const search = document.getElementById('mv-kn-search');
  if (search) {
    search.addEventListener('input', () => {
      const q = (search.value || '').toLowerCase();
      document.querySelectorAll('.mv-kn-entry').forEach((el) => {
        const text = (el.getAttribute('data-search') || '').toLowerCase();
        const cat = el.closest('.mv-kn-category');
        if (!cat) return;
        const visible = text.includes(q);
        el.style.display = visible ? '' : 'none';
        // Show / hide category headers when all children are hidden.
        const any = Array.from(cat.querySelectorAll('.mv-kn-entry')).some(
          (e) => e.style.display !== 'none',
        );
        cat.style.display = any ? '' : 'none';
      });
    });
  }
})();
`.trim();

const renderCategory = (
	category: string,
	entries: readonly IKnowledgeListEntry[],
	onOpenEntry: string,
): string => {
	const rows = entries
		.map((e) => {
			const data = `${e.id} ${e.title} ${category}`;
			return `<li class="mv-kn-entry" data-search="${escapeHtml(data)}">
				<a href="#" data-entry="${escapeHtml(e.id)}" onclick="event.preventDefault(); window.dispatchEvent(new CustomEvent('mv-kn-open', {detail: '${escapeHtml(e.id)}'}))">
					<code>${escapeHtml(e.id)}</code>
					<span class="mv-kn-title">${escapeHtml(e.title)}</span>
				</a>
			</li>`;
		})
		.join('');
	return `<section class="mv-kn-category" data-category="${escapeHtml(category)}">
		<h3 class="mv-kn-cat">${escapeHtml(category)} <span class="mv-kn-count">${entries.length}</span></h3>
		<ul class="mv-kn-list">${rows}</ul>
	</section>`;
};

const renderPreview = (entry: IKnowledgeFullEntry | undefined): string => {
	if (entry === undefined) {
		return `<aside class="mv-kn-preview mv-kn-preview--empty">
			<p>Select an entry on the left to preview it here.</p>
		</aside>`;
	}
	return `<aside class="mv-kn-preview">
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
	<title>mcp-vertex Knowledge</title>
	<style>
		:root {
			--mv-fg: var(--vscode-foreground, #c9d1d9);
			--mv-bg: var(--vscode-editor-background, #0d1117);
			--mv-border: var(--vscode-widget-border, #30363d);
			--mv-surface: var(--vscode-side-bar-background, #161b22);
			--mv-accent: var(--mv-brand-purple, #a371f7);
		}
		* { box-sizing: border-box; }
		body {
			margin: 0;
			font-family: var(--vscode-font-family, system-ui);
			color: var(--mv-fg);
			background: var(--mv-bg);
			display: grid;
			grid-template-columns: 320px 1fr;
			grid-template-rows: 48px 1fr;
			height: 100vh;
		}
		header.mv-kn-top {
			grid-column: 1 / 3;
			display: flex;
			align-items: center;
			gap: 12px;
			padding: 0 16px;
			border-bottom: 1px solid var(--mv-border);
			background: var(--mv-surface);
		}
		header.mv-kn-top h1 {
			font-size: 13px;
			margin: 0;
			font-weight: 700;
		}
		header.mv-kn-top input {
			flex: 1;
			padding: 6px 10px;
			background: var(--mv-bg);
			color: var(--mv-fg);
			border: 1px solid var(--mv-border);
			border-radius: 4px;
			font: inherit;
		}
		aside.mv-kn-list-pane {
			overflow-y: auto;
			padding: 8px 12px;
			border-right: 1px solid var(--mv-border);
		}
		.mv-kn-category { margin: 0 0 16px; }
		.mv-kn-cat {
			font-size: 11px;
			text-transform: uppercase;
			letter-spacing: 0.06em;
			color: var(--mv-fg-muted, #8b949e);
			margin: 0 0 4px;
			display: flex;
			gap: 6px;
			align-items: center;
		}
		.mv-kn-count {
			font-size: 10px;
			padding: 0 6px;
			border-radius: 999px;
			background: var(--mv-accent);
			color: #fff;
		}
		.mv-kn-list { list-style: none; padding: 0; margin: 0; }
		.mv-kn-entry a {
			display: block;
			padding: 6px 8px;
			border-radius: 4px;
			color: var(--mv-fg);
			text-decoration: none;
		}
		.mv-kn-entry a:hover { background: var(--mv-surface); }
		.mv-kn-entry code {
			font-size: 10px;
			color: var(--mv-fg-muted, #8b949e);
			display: block;
		}
		.mv-kn-title { font-size: 12px; }
		.mv-kn-preview {
			overflow-y: auto;
			padding: 24px 32px;
		}
		.mv-kn-preview--empty { color: var(--mv-fg-muted, #8b949e); }
		.mv-kn-preview header { margin-bottom: 16px; }
		.mv-kn-preview h2 { margin: 0 0 4px; font-size: 18px; }
		.mv-kn-preview code {
			font-size: 11px;
			color: var(--mv-fg-muted, #8b949e);
		}
		.mv-kn-preview pre {
			white-space: pre-wrap;
			word-wrap: break-word;
			font-family: var(--vscode-editor-font-family, monospace);
			font-size: 12px;
			line-height: 1.6;
		}
	</style>
</head>
<body>
	<header class="mv-kn-top">
		<h1>mcp-vertex Knowledge</h1>
		<input id="mv-kn-search" type="text" placeholder="Search entries (id or title)…" />
	</header>
	<aside class="mv-kn-list-pane">
		${left || '<p>No knowledge entries.</p>'}
	</aside>
	${renderPreview(options.preview)}
	<script>${CLIENT_SCRIPT}</script>
	<script>
		// Forward entry clicks to the host as messages.
		document.addEventListener('click', (e) => {
			const a = e.target && e.target.closest && e.target.closest('a[data-entry]');
			if (!a) return;
			e.preventDefault();
			const id = a.getAttribute('data-entry');
			// Acquire the VS Code webview API and post a message.
			const vscode = window.acquireVsCodeApi && window.acquireVsCodeApi();
			if (vscode) vscode.postMessage({ command: 'openEntry', id });
		});
		window.addEventListener('message', (e) => {
			const msg = e.data;
			if (msg && msg.command === 'preview' && msg.entry) {
				const preview = document.querySelector('.mv-kn-preview');
				if (preview && msg.entry.body) {
					preview.innerHTML = '<header><h2>' + msg.entry.title + '</h2><code>' + msg.entry.id + '</code></header><pre>' + msg.entry.body.replace(/[<>&]/g, c => ({'<':'&lt;','>':'&gt;','&':'&amp;'}[c])) + '</pre>';
				}
			}
		});
	</script>
</body>
</html>`;
};
