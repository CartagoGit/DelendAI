import type { IMetricsSnapshot, IToolDescriptor } from '@mcp-vertex/client';
import { DEFAULT_DENY, injectCspMeta } from '@mcp-vertex/ui-extension/webview';

import {
	type IRenderableSchema,
	escapeHtml,
	renderOutputSchema,
} from './render-output-schema';
import { viewCopyFor, type IViewCopy } from '../i18n/view-copy.strings';

// Inline twin of `tool-detail.css` (which stays for the dev harness's
// static shell). A `<link href="./tool-detail.css">` NEVER loads inside a
// VS Code webview — relative URIs need `asWebviewUri` — so the panel
// rendered unstyled; the CSP (style-src 'unsafe-inline') permits the
// inline form.
const TOOL_DETAIL_STYLE = `<style>
body { box-sizing: border-box; margin: 0; padding: 16px; font-family: var(--vscode-font-family); color: var(--vscode-foreground); background: var(--vscode-editor-background); }
pre, code { font-family: var(--vscode-editor-font-family); }
.schema__props { display: grid; gap: 8px; padding-left: 18px; }
.schema__node { margin-top: 6px; }
</style>`;

export interface IToolDetailViewModel {
	readonly tool: IToolDescriptor;
	readonly inputSchema?: IRenderableSchema;
	readonly outputSchema?: IRenderableSchema;
	readonly knowledgeBody?: string;
	readonly metrics?: IMetricsSnapshot;
	readonly copy?: IViewCopy;
}

const countLabel = (value: number, singular: string, plural: string): string =>
	`${value} ${value === 1 ? singular : plural}`;

export const renderToolDetailHtml = (model: IToolDetailViewModel): string => {
	const metric = model.metrics?.tools[model.tool.name];
	const copy = model.copy ?? viewCopyFor('en');
	return injectCspMeta(
		`<!DOCTYPE html>
<html lang="${copy.lang}">
<head>
	<meta charset="UTF-8" />
	<meta name="viewport" content="width=device-width, initial-scale=1.0" />
	${TOOL_DETAIL_STYLE}
	<title>${escapeHtml(model.tool.name)}</title>
</head>
<body>
	<h1>${escapeHtml(model.tool.name)}</h1>
	<p>${escapeHtml(model.tool.summary ?? model.tool.plugin)}</p>
	${model.knowledgeBody === undefined ? '' : `<section><h2>${escapeHtml(copy.knowledge)}</h2><pre>${escapeHtml(model.knowledgeBody)}</pre></section>`}
	<section><h2>${escapeHtml(copy.inputSchema)}</h2>${model.inputSchema === undefined ? `<p>${escapeHtml(copy.noInputSchema)}</p>` : renderOutputSchema(model.inputSchema, copy)}</section>
	<section><h2>${escapeHtml(copy.outputSchema)}</h2>${model.outputSchema === undefined ? `<p>${escapeHtml(copy.noOutputSchema)}</p>` : renderOutputSchema(model.outputSchema, copy)}</section>
	<section><h2>${escapeHtml(copy.metrics)}</h2>${metric === undefined ? `<p>${escapeHtml(copy.noCalls)}</p>` : `<p>${escapeHtml(countLabel(metric.calls, copy.callSingular, copy.calls))}, ${escapeHtml(countLabel(metric.errors, copy.errorSingular, copy.errors))}, ${escapeHtml(copy.max)} ${metric.maxMs}ms</p>`}</section>
</body>
</html>`,
		DEFAULT_DENY,
	);
};

/**
 * `renderToolDetailBody` — same data the full HTML mode produces,
 * but emits just the `<body>` content so the dev preview's lazy
 * pages can mount it inside their own `<main>` without parsing
 * an `<html>` inside an `<html>`.
 *
 * The body uses the `tool-detail` BEM block (defined in the dev
 * preview SCSS) instead of relying on the inline `<style>` block
 * used by `renderToolDetailHtml`. The dev preview shell already
 * has the BEM rules mounted, so a body fragment can pick them up
 * without duplicating rules.
 */
export const renderToolDetailBody = (model: IToolDetailViewModel): string => {
	const metric = model.metrics?.tools[model.tool.name];
	const copy = model.copy ?? viewCopyFor('en');
	return `<section class="tool-detail">
		<header class="tool-detail__head">
			<h1>${escapeHtml(model.tool.name)}</h1>
			<p>${escapeHtml(model.tool.summary ?? model.tool.plugin)}</p>
		</header>
		${model.knowledgeBody === undefined ? '' : `<section class="tool-detail__section"><h2>${escapeHtml(copy.knowledge)}</h2><pre class="tool-detail__knowledge">${escapeHtml(model.knowledgeBody)}</pre></section>`}
		<section class="tool-detail__section"><h2>${escapeHtml(copy.inputSchema)}</h2>${model.inputSchema === undefined ? `<p>${escapeHtml(copy.noInputSchema)}</p>` : renderOutputSchema(model.inputSchema, copy)}</section>
		<section class="tool-detail__section"><h2>${escapeHtml(copy.outputSchema)}</h2>${model.outputSchema === undefined ? `<p>${escapeHtml(copy.noOutputSchema)}</p>` : renderOutputSchema(model.outputSchema, copy)}</section>
		<section class="tool-detail__section"><h2>${escapeHtml(copy.metrics)}</h2>${metric === undefined ? `<p>${escapeHtml(copy.noCalls)}</p>` : `<p>${escapeHtml(countLabel(metric.calls, copy.callSingular, copy.calls))}, ${escapeHtml(countLabel(metric.errors, copy.errorSingular, copy.errors))}, ${escapeHtml(copy.max)} ${metric.maxMs}ms</p>`}</section>
	</section>`;
};
