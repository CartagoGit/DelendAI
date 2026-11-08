/**
 * `IRenderableSchema` — host-agnostic, structurally-typed JSON-schema
 * shape consumed by `renderOutputSchema` and `renderToolDetail`. The
 * extension's local copy in `extensions/vscode/src/views/render-output-schema.ts`
 * mirrors this exactly; the shared version here is what every host
 * renderer imports from now on.
 */
export interface IRenderableSchema {
	readonly type?: string;
	readonly description?: string;
	readonly properties?: Record<string, IRenderableSchema>;
	readonly items?: IRenderableSchema;
	readonly enum?: readonly string[];
	readonly required?: readonly string[];
	readonly additionalProperties?: boolean | IRenderableSchema;
}
