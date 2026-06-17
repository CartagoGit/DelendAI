/**
 * emit-tool-types.ts — pure JSON-Schema → TypeScript emitter for the
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

export const PACKAGE_ROUTES: Readonly<Record<string, IPackageRoute>> = {
	mcpcore: { dir: 'packages/core', label: 'McpCore' },
	git: { dir: 'plugins/git', label: 'Git' },
	memory: { dir: 'plugins/memory', label: 'Memory' },
	search: { dir: 'plugins/search', label: 'Search' },
	quality: { dir: 'plugins/quality', label: 'Quality' },
	notification: { dir: 'plugins/notification', label: 'Notification' },
	docs: { dir: 'plugins/docs', label: 'Docs' },
	deps: { dir: 'plugins/deps', label: 'Deps' },
	proposals: { dir: 'plugins/proposals', label: 'Proposals' },
};

/** Relative path (from a package dir) of the generated module. */
export const GENERATED_REL_PATH = 'src/generated/tool-outputs.ts';

const IDENT_RE = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

/** PascalCase a snake/kebab tool name: `git_status` → `GitStatus`. */
export const pascalCase = (name: string): string =>
	name
		.split(/[_\-/]+/)
		.filter((part) => part.length > 0)
		.map((part) => part.charAt(0).toUpperCase() + part.slice(1))
		.join('');

/** Interface name for a tool's output, e.g. `git_status` → `GitStatusOutput`. */
export const outputInterfaceName = (toolName: string): string =>
	`${pascalCase(toolName)}Output`;

const propKey = (name: string): string =>
	IDENT_RE.test(name) ? name : JSON.stringify(name);

const isPlainSubset = (node: IJsonSchemaNode | boolean | undefined): boolean =>
	typeof node === 'object' && node !== null;

/**
 * Render a JSON Schema node as an inline TypeScript type expression.
 * `indent` is the tab depth used when the node expands into a
 * multi-line object literal.
 */
export const jsonSchemaToTs = (
	node: IJsonSchemaNode | boolean,
	indent = 0
): string => {
	// `true`/`{}` (no constraints) → unknown.
	if (node === true) return 'unknown';
	if (node === false) return 'never';
	if (typeof node !== 'object' || node === null) return 'unknown';

	if (node.const !== undefined) return JSON.stringify(node.const);
	if (node.enum !== undefined && node.enum.length > 0) {
		return dedupeUnion(node.enum.map((value) => JSON.stringify(value)));
	}

	const variants = node.anyOf ?? node.oneOf;
	if (variants !== undefined && variants.length > 0) {
		return dedupeUnion(
			variants.map((variant) => jsonSchemaToTs(variant, indent))
		);
	}

	const type = Array.isArray(node.type) ? node.type[0] : node.type;
	switch (type) {
		case 'string':
			return 'string';
		case 'number':
		case 'integer':
			return 'number';
		case 'boolean':
			return 'boolean';
		case 'null':
			return 'null';
		case 'array':
			return emitArray(node, indent);
		case 'object':
			return emitObject(node, indent);
		default:
			// No `type` but an object shape (properties/additionalProperties).
			if (node.properties !== undefined || node.additionalProperties !== undefined) {
				return emitObject(node, indent);
			}
			return 'unknown';
	}
};

const dedupeUnion = (parts: readonly string[]): string => {
	const seen = new Set<string>();
	const unique: string[] = [];
	for (const part of parts) {
		if (seen.has(part)) continue;
		seen.add(part);
		unique.push(part);
	}
	return unique.join(' | ');
};

const emitArray = (node: IJsonSchemaNode, indent: number): string => {
	const item = node.items === undefined ? 'unknown' : jsonSchemaToTs(node.items, indent);
	// Parenthesise unions so `A | B[]` is read as `(A | B)[]`.
	return /[|&]/.test(item) ? `Array<${item}>` : `${item}[]`;
};

const emitObject = (node: IJsonSchemaNode, indent: number): string => {
	const named = Object.keys(node.properties ?? {}).length;
	if (named === 0) {
		// No named properties: render as a Record (cleaner than an inline
		// object with only an index signature).
		const ap = node.additionalProperties;
		if (ap === false || ap === undefined) return 'Record<string, never>';
		if (ap === true || (isPlainSubset(ap) && Object.keys(ap as object).length === 0)) {
			return 'Record<string, unknown>';
		}
		return `Record<string, ${jsonSchemaToTs(ap as IJsonSchemaNode, indent)}>`;
	}
	const pad = '\t'.repeat(indent);
	const lines = objectMemberLines(node, indent + 1);
	return `{\n${lines.join('\n')}\n${pad}}`;
};

/**
 * Render the member lines of an object node (named properties + optional
 * index signature for `additionalProperties`). Shared by `emitObject`
 * and the top-level interface emitter.
 */
export const objectMemberLines = (
	node: IJsonSchemaNode,
	indent: number
): string[] => {
	const pad = '\t'.repeat(indent);
	const required = new Set(node.required ?? []);
	const lines: string[] = [];
	for (const [key, child] of Object.entries(node.properties ?? {})) {
		const optional = required.has(key) ? '' : '?';
		const ts = jsonSchemaToTs(child, indent);
		lines.push(`${pad}${propKey(key)}${optional}: ${ts};`);
	}
	const ap = node.additionalProperties;
	if (ap !== undefined && ap !== false) {
		const valueTs =
			ap === true || (isPlainSubset(ap) && Object.keys(ap as object).length === 0)
				? 'unknown'
				: jsonSchemaToTs(ap as IJsonSchemaNode, indent);
		lines.push(`${pad}[key: string]: ${valueTs};`);
	}
	return lines;
};

const FILE_HEADER = `/**
 * GENERATED FILE — DO NOT EDIT.
 *
 * Typed \`structuredContent\` shapes for this package's MCP tools,
 * generated from each tool's Zod \`outputSchema\` by:
 *
 *     bun run types:generate
 *
 * The drift guard in the test suite fails if this file is stale, so any
 * change to a tool's \`outputSchema\` must be accompanied by a regenerate.
 * Action-multiplexed tools whose schema is intentionally permissive
 * surface as \`Record<string, unknown>\`.
 */`;

/**
 * Build the full `.ts` module for one package from its harvested tools
 * (already filtered to that package and sorted by name). Pure: returns
 * the file content as a string.
 */
export const emitToolOutputsModule = (
	label: string,
	tools: readonly IHarvestedTool[]
): string => {
	const blocks: string[] = [FILE_HEADER];
	for (const tool of tools) {
		const name = outputInterfaceName(tool.name);
		const members = objectMemberLines(tool.schema, 1);
		const body = members.length === 0 ? '' : `\n${members.join('\n')}\n`;
		blocks.push(`export interface ${name} {${body}}`);
	}
	const mapLines = tools.map(
		(tool) => `\t${JSON.stringify(tool.name)}: ${outputInterfaceName(tool.name)};`
	);
	blocks.push(
		`/** Map of this package's MCP tool names to their \`structuredContent\` type. */\nexport interface ${label}ToolOutputs {\n${mapLines.join('\n')}\n}`
	);
	return `${blocks.join('\n\n')}\n`;
};

/**
 * Route harvested tools to their package modules. Returns a map of
 * `<dir>/<GENERATED_REL_PATH>` → file content, deterministic in tool order.
 */
export const buildPackageModules = (
	tools: readonly IHarvestedTool[]
): Map<string, string> => {
	const byPrefix = new Map<string, IHarvestedTool[]>();
	for (const tool of tools) {
		const prefix = tool.name.split('_')[0] ?? '';
		const bucket = byPrefix.get(prefix);
		if (bucket) bucket.push(tool);
		else byPrefix.set(prefix, [tool]);
	}
	const out = new Map<string, string>();
	for (const [prefix, bucket] of byPrefix) {
		const route = PACKAGE_ROUTES[prefix];
		if (route === undefined) {
			throw new Error(
				`[types:generate] no PACKAGE_ROUTES entry for prefix "${prefix}" (tool "${bucket[0]?.name}")`
			);
		}
		const sorted = [...bucket].sort((a, b) => a.name.localeCompare(b.name));
		out.set(
			`${route.dir}/${GENERATED_REL_PATH}`,
			emitToolOutputsModule(route.label, sorted)
		);
	}
	return out;
};
