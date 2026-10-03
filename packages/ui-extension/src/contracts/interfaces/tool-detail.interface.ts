/**
 * `IToolDetail` — the host-agnostic shape consumed by the shared
 * tool-detail renderer. This is intentionally narrower than the
 * extension's `IToolDetailViewModel`: only the fields the renderer
 * actually reads are part of the contract, so any host that can
 * produce these fields (VS Code, JetBrains, Zed, the docs site
 * preview) can reuse the same HTML.
 *
 * Hosts with their own copy bridge (VS Code's `viewCopyFor(lang)`)
 * map their localized strings onto `IToolDetail.copy`. The renderer
 * falls back to English copy when a string is missing, so partial
 * translations stay visually coherent.
 */
import type { IMetricsSnapshot, IToolDescriptor } from '@delendai/client';

import type { IRenderableSchema } from './renderable-schema.interface';

/** Minimal, host-agnostic copy for the tool-detail renderer. */
export interface IToolDetailCopy {
	readonly lang: string;
	readonly knowledge: string;
	readonly inputSchema: string;
	readonly noInputSchema: string;
	readonly outputSchema: string;
	readonly noOutputSchema: string;
	readonly metrics: string;
	readonly noCalls: string;
	readonly callSingular: string;
	readonly calls: string;
	readonly errorSingular: string;
	readonly errors: string;
	readonly max: string;
	readonly items: string;
	readonly required: string;
	readonly optional: string;
	readonly enumLabel: string;
}

export interface IToolDetail {
	readonly tool: IToolDescriptor;
	readonly inputSchema?: IRenderableSchema;
	readonly outputSchema?: IRenderableSchema;
	readonly knowledgeBody?: string;
	readonly metrics?: IMetricsSnapshot;
	/** Optional host copy. Falls back to English when omitted. */
	readonly copy?: IToolDetailCopy;
}
