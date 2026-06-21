import type { IMetricsSnapshot, IToolDescriptor } from '@mcp-vertex/client';

import {
	type IRenderableSchema,
	escapeHtml,
	renderOutputSchema,
} from './render-output-schema';

export interface IToolDetailViewModel {
	readonly tool: IToolDescriptor;
	readonly inputSchema?: IRenderableSchema;
	readonly outputSchema?: IRenderableSchema;
	readonly knowledgeBody?: string;
	readonly metrics?: IMetricsSnapshot;
}

export const renderToolDetailHtml = (model: IToolDetailViewModel): string => {
	const metric = model.metrics?.tools[model.tool.name];
	return `<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8" />
	<meta name="viewport" content="width=device-width, initial-scale=1.0" />
	<link rel="stylesheet" href="./tool-detail.css" />
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
</html>`;
};
