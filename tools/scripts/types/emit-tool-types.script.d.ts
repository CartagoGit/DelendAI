/**
 * emit-tool-types.script.ts — pure JSON-Schema → TypeScript emitter for the
 * generated tool-output SDK (N23). No filesystem, no MCP, no deps: it
 * turns the JSON Schema produced by `z.toJSONSchema` (Zod v4) for each
 * tool's `outputSchema` into a `.ts` module of `export interface`s plus
 * a per-package `<Label>ToolOutputs` name→type map.
 *
 * The supported subset is exactly what the project's outputSchemas emit
 * (verified by harvesting every tool): object/string/number/boolean/null
 * /array, `anyOf` (unions, incl. nullable), `const` (literals) and the
 * three `additionalProperties` shapes (closed `false`, open `{}` and a
 * record schema). Anything outside the subset degrades to `unknown` so a
 * new construct can never produce invalid TypeScript silently.
 */
/** A minimal structural view of the JSON Schema nodes we consume. */
export interface IJsonSchemaNode {
	readonly type?: string | readonly string[];
	readonly properties?: Readonly<Record<string, IJsonSchemaNode>>;
	readonly required?: readonly string[];
	readonly additionalProperties?: boolean | IJsonSchemaNode;
	readonly items?: IJsonSchemaNode;
	readonly anyOf?: readonly IJsonSchemaNode[];
	readonly oneOf?: readonly IJsonSchemaNode[];
	readonly const?: unknown;
	readonly enum?: readonly unknown[];
}
/** A harvested tool: its fully-qualified MCP name and output JSON Schema. */
export interface IHarvestedTool {
	readonly name: string;
	readonly schema: IJsonSchemaNode;
}
/** Where each namespace prefix's generated module is written, and its label. */
export interface IPackageRoute {
	readonly dir: string;
	readonly label: string;
}
export declare const PACKAGE_ROUTES: Readonly<Record<string, IPackageRoute>>;
/** Relative path (from a package dir) of the generated module. */
export declare const GENERATED_REL_PATH = 'src/generated/tool-outputs.ts';
/** PascalCase a snake/kebab tool name: `delendai_git_status` → `GitStatus`. */
export declare const pascalCase: (name: string) => string;
/** Interface name for a tool's output, e.g. `delendai_git_status` → `GitStatusOutput`. */
export declare const outputInterfaceName: (toolName: string) => string;
/**
 * Render a JSON Schema node as an inline TypeScript type expression.
 * `indent` is the tab depth used when the node expands into a
 * multi-line object literal.
 */
export declare const jsonSchemaToTs: (
	node: IJsonSchemaNode | boolean,
	indent?: number,
) => string;
/**
 * Render the member lines of an object node (named properties + optional
 * index signature for `additionalProperties`). Shared by `emitObject`
 * and the top-level interface emitter.
 */
export declare const objectMemberLines: (
	node: IJsonSchemaNode,
	indent: number,
) => string[];
/**
 * Build the full `.ts` module for one package from its harvested tools
 * (already filtered to that package and sorted by name). Pure: returns
 * the file content as a string.
 */
export declare const emitToolOutputsModule: (
	label: string,
	tools: readonly IHarvestedTool[],
) => string;
/**
 * Route harvested tools to their package modules. Returns a map of
 * `<dir>/<GENERATED_REL_PATH>` → file content, deterministic in tool order.
 */
export declare const buildPackageModules: (
	tools: readonly IHarvestedTool[],
) => Map<string, string>;
