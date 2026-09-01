import type { IMetricsSnapshot, IToolDescriptor } from '@mcp-vertex/client';
import {
	renderToolDetailBody as renderSharedToolDetailBody,
	renderToolDetailHtml as renderSharedToolDetailHtml,
	type IRenderableSchema,
	type IToolDetail,
	type IToolDetailCopy,
} from '@mcp-vertex/ui-extension/webview';

import type { IViewCopy } from '../contracts/interfaces/view-copy.interface';
import { viewCopyFor } from '../i18n/view-copy.strings';

export interface IToolDetailViewModel {
	readonly tool: IToolDescriptor;
	readonly inputSchema?: IRenderableSchema;
	readonly outputSchema?: IRenderableSchema;
	readonly knowledgeBody?: string;
	readonly metrics?: IMetricsSnapshot;
	readonly copy?: IViewCopy;
}

/**
 * Project the legacy `IViewCopy` onto the host-agnostic
 * `IToolDetailCopy` consumed by the shared renderer. Keeping this
 * mapping inside the extension means the shared renderer can stay
 * free of VS Code vocabulary.
 */
const projectCopy = (viewCopy: IViewCopy): IToolDetailCopy => ({
	lang: viewCopy.lang,
	knowledge: viewCopy.knowledge,
	inputSchema: viewCopy.inputSchema,
	noInputSchema: viewCopy.noInputSchema,
	outputSchema: viewCopy.outputSchema,
	noOutputSchema: viewCopy.noOutputSchema,
	metrics: viewCopy.metrics,
	noCalls: viewCopy.noCalls,
	callSingular: viewCopy.callSingular,
	calls: viewCopy.calls,
	errorSingular: viewCopy.errorSingular,
	errors: viewCopy.errors,
	max: viewCopy.max,
	items: viewCopy.items,
	required: viewCopy.required,
	optional: viewCopy.optional,
	enumLabel: viewCopy.enumLabel,
});

const toShared = (model: IToolDetailViewModel): IToolDetail => {
	const shared: IToolDetail = {
		tool: model.tool,
		copy: projectCopy(model.copy ?? viewCopyFor('en')),
	};
	return {
		...shared,
		...(model.inputSchema === undefined
			? {}
			: { inputSchema: model.inputSchema }),
		...(model.outputSchema === undefined
			? {}
			: { outputSchema: model.outputSchema }),
		...(model.knowledgeBody === undefined
			? {}
			: { knowledgeBody: model.knowledgeBody }),
		...(model.metrics === undefined ? {} : { metrics: model.metrics }),
	};
};

export const renderToolDetailHtml = (model: IToolDetailViewModel): string =>
	renderSharedToolDetailHtml(toShared(model));

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
export const renderToolDetailBody = (model: IToolDetailViewModel): string =>
	renderSharedToolDetailBody(toShared(model));
