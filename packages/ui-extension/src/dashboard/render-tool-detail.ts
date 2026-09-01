/**
 * `renderToolDetailHtml` — host-agnostic HTML for the tool-detail
 * page (f00100-S4-stability). The output uses the same `tool-detail`
 * BEM block the dev preview mounts, so the dashboard shell can
 * inline this fragment without parsing an `<html>` inside an
 * `<html>`.
 *
 * The full HTML mode (`renderToolDetailHtml`) still injects a CSP
 * meta tag and an inline `<style>` block because some hosts
 * (VS Code's webview) cannot resolve a `<link href="./tool-detail.css">`
 * without `asWebviewUri` plumbing.
 */
import type { IMetricsSnapshot } from '@mcp-vertex/client';
import { DEFAULT_DENY, injectCspMeta } from '../webview/csp';
import type {
	IToolDetail,
	IToolDetailCopy,
} from '../contracts/interfaces/tool-detail.interface';
import { escapeHtml, renderOutputSchema } from './render-output-schema';

/** English fallback copy — used when a host omits `copy`. */
export const DEFAULT_TOOL_DETAIL_COPY: IToolDetailCopy = {
	lang: 'en',
	knowledge: 'Knowledge',
	inputSchema: 'Input schema',
	noInputSchema: 'No input schema.',
	outputSchema: 'Output schema',
	noOutputSchema: 'No output schema.',
	metrics: 'Metrics',
	noCalls: 'No calls recorded.',
	callSingular: 'call',
	calls: 'calls',
	errorSingular: 'error',
	errors: 'errors',
	max: 'max',
	items: 'items',
	required: 'required',
	optional: 'optional',
	enumLabel: 'enum',
};

const countLabel = (value: number, singular: string, plural: string): string =>
	`${value} ${value === 1 ? singular : plural}`;

const resolveMetric = (
	metrics: IMetricsSnapshot | undefined,
	toolName: string,
): IMetricsSnapshot['tools'][string] | undefined => metrics?.tools[toolName];

const TOOL_DETAIL_STYLE = `<style>
body { box-sizing: border-box; margin: 0; padding: 16px; font-family: var(--vscode-font-family, system-ui, sans-serif); color: var(--vscode-foreground, #ddd); background: var(--vscode-editor-background, #1e1e1e); }
pre, code { font-family: var(--vscode-editor-font-family, monospace); }
.schema__props { display: grid; gap: 8px; padding-left: 18px; }
.schema__node { margin-top: 6px; }
</style>`;

/**
 * Full standalone HTML mode — emit an entire `<!DOCTYPE html>`
 * document with CSP, inline styles, and a `<body>` that uses the
 * shared `tool-detail` BEM tree. Useful when this renderer is the
 * only content of a webview panel.
 */
export const renderToolDetailHtml = (model: IToolDetail): string => {
	const copy: IToolDetailCopy = model.copy ?? DEFAULT_TOOL_DETAIL_COPY;
	const metric = resolveMetric(model.metrics, model.tool.name);
	return injectCspMeta(
		`<!DOCTYPE html>
<html lang="${escapeHtml(copy.lang)}">
<head>
	<meta charset="UTF-8" />
	<meta name="viewport" content="width=device-width, initial-scale=1.0" />
	${TOOL_DETAIL_STYLE}
	<title>${escapeHtml(model.tool.name)}</title>
</head>
<body>
	${renderToolDetailBody(model, copy, metric)}
</body>
</html>`,
		DEFAULT_DENY,
	);
};

/**
 * `renderToolDetailBody` — same data the full HTML mode produces,
 * but emits just the body content (BEM tree) so a host shell can
 * mount it inside its own `<main>` without parsing `<html>` inside
 * `<html>`. The host's CSS provides the `tool-detail` rules.
 */
export const renderToolDetailBody = (
	model: IToolDetail,
	copyOverride?: IToolDetailCopy,
	metricOverride?: IMetricsSnapshot['tools'][string],
): string => {
	const copy: IToolDetailCopy =
		copyOverride ?? model.copy ?? DEFAULT_TOOL_DETAIL_COPY;
	const metric =
		metricOverride ?? resolveMetric(model.metrics, model.tool.name);
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
