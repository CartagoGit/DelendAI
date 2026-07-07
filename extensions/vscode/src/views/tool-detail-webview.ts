import type { IMetricsSnapshot, IToolDescriptor } from '@mcp-vertex/client';
import { DEFAULT_DENY, injectCspMeta } from '@mcp-vertex/ui-extension/public';

import {
	type IRenderableSchema,
	escapeHtml,
	renderOutputSchema,
} from './render-output-schema';

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
}

export const renderToolDetailHtml = (model: IToolDetailViewModel): string => {
	const metric = model.metrics?.tools[model.tool.name];
	return injectCspMeta(
		`<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8" />
	<meta name="viewport" content="width=device-width, initial-scale=1.0" />
	${TOOL_DETAIL_STYLE}
	<title>${escapeHtml(model.tool.name)}</title>
</head>
<body>
	<h1>${escapeHtml(model.tool.name)}</h1>
	<p>${escapeHtml(model.tool.summary ?? model.tool.plugin)}</p>
	${model.knowledgeBody === undefined ? '' : `<section><h2>Knowledge</h2><pre>${escapeHtml(model.knowledgeBody)}</pre></section>`}
	<section><h2>Input schema</h2>${model.inputSchema === undefined ? '<p>No input schema.</p>' : renderOutputSchema(model.inputSchema)}</section>
	<section><h2>Output schema</h2>${model.outputSchema === undefined ? '<p>No output schema.</p>' : renderOutputSchema(model.outputSchema)}</section>
	<section><h2>Metrics</h2>${metric === undefined ? '<p>No calls recorded.</p>' : `<p>${metric.calls} calls, ${metric.errors} errors, max ${metric.maxMs}ms</p>`}</section>
</body>
</html>`,
		DEFAULT_DENY,
	);
};
