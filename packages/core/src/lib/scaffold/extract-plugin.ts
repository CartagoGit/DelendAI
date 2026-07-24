import { readdirSync, readFileSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, extname, relative, resolve } from 'node:path';

import { type IScaffoldedFile, scaffoldPluginFiles } from './scaffold-host';

const require = createRequire(import.meta.url);

export interface IExtractPluginOptions {
	readonly sourceGlobs: readonly string[];
	readonly targetPluginId: string;
	readonly pluginName: string;
	readonly description: string;
	/** injected for tests; defaults to a real fs read + ts.createSourceFile */
	readonly readFile?: (path: string) => string | undefined;
}

export interface IExtractedTool {
	readonly name: string;
	readonly exportName: string;
	readonly sourcePath: string;
	readonly inputZod: string;
	readonly outputZod: string;
	readonly stubBody: string;
	readonly isMarkedTodo: true;
}

export interface IExtractPluginResult {
	readonly targetPluginId: string;
	readonly files: readonly {
		readonly path: string;
		readonly content: string;
	}[];
	readonly tools: readonly IExtractedTool[];
	readonly skippedExports: readonly {
		readonly name: string;
		readonly reason:
			| 'has-side-effects'
			| 'untyped-parameter'
			| 'unsupported-shape';
	}[];
}

type SkipReason = IExtractPluginResult['skippedExports'][number]['reason'];

interface IAnalyzedType {
	readonly schema: string;
	readonly isObjectLiteral: boolean;
	readonly wrapInResult: boolean;
	readonly supported: boolean;
}

interface IReturnAnalysis {
	readonly awaitResult: boolean;
	readonly outputSchema: string;
	readonly outputExpression: string;
	readonly supported: boolean;
}

interface IExtractCandidate {
	readonly name: string;
	readonly exportName: string;
	readonly toolName: string;
	readonly sourcePath: string;
	readonly registerName: string;
	readonly toolConstName: string;
	readonly importPath: string;
	readonly inputZod: string;
	readonly outputZod: string;
	readonly stubBody: string;
	readonly stubFilePath: string;
	readonly testFilePath: string;
	readonly toolSource: string;
	readonly testSource: string;
	readonly toolDescription: string;
	readonly knowledgeTitle: string;
	readonly pluginToolId: string;
	readonly isMarkedTodo: true;
}

interface IFunctionCandidate {
	readonly exportName: string;
	readonly body: unknown;
	readonly parameters: readonly unknown[];
	readonly returnType: unknown;
}

interface IFsImportBindings {
	readonly namespaceImports: ReadonlySet<string>;
	readonly namedImports: ReadonlySet<string>;
}

const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx', '.mts', '.cts']);

const loadTsCompilerApi = (): Record<string, any> => {
	const resolvedPackageJson = require.resolve('typescript/package.json');
	const bunStoreDir = resolve(dirname(resolvedPackageJson), '..', '..', '..');
	const candidates: string[] = [];
	for (const entry of readdirSync(bunStoreDir, { withFileTypes: true })) {
		if (!entry.isDirectory() || !entry.name.startsWith('typescript@')) {
			continue;
		}
		candidates.push(
			resolve(
				bunStoreDir,
				entry.name,
				'node_modules/typescript/lib/typescript.js',
			),
		);
	}
	for (const candidate of candidates.sort().reverse()) {
		try {
			const mod = require(candidate);
			const api = mod.default ?? mod;
			if (
				typeof api.createSourceFile === 'function' &&
				typeof api.forEachChild === 'function' &&
				typeof api.SyntaxKind === 'object'
			) {
				return api as Record<string, any>;
			}
		} catch {}
	}
	throw new Error(
		'No usable TypeScript Compiler API runtime was found in the Bun store.',
	);
};

const tsCompiler = loadTsCompilerApi();

const defaultReadFile = (path: string): string | undefined => {
	try {
		return readFileSync(path, 'utf8');
	} catch {
		return undefined;
	}
};

const kebab = (value: string): string =>
	value
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '');

const snake = (value: string): string =>
	value
		.replace(/([a-z0-9])([A-Z])/g, '$1_$2')
		.replace(/[^a-zA-Z0-9]+/g, '_')
		.replace(/^_+|_+$/g, '')
		.toLowerCase();

const pascal = (value: string): string =>
	kebab(value)
		.split('-')
		.map((part) => part.charAt(0).toUpperCase() + part.slice(1))
		.join('');

const toPosix = (value: string): string => value.replaceAll('\\', '/');

const withoutTypeExtension = (value: string): string =>
	value.replace(/\.(cts|mts|tsx|ts)$/u, '');

const isDirectory = (path: string): boolean => {
	try {
		return statSync(path).isDirectory();
	} catch {
		return false;
	}
};

const isFile = (path: string): boolean => {
	try {
		return statSync(path).isFile();
	} catch {
		return false;
	}
};

const walkFiles = (root: string): readonly string[] => {
	const results: string[] = [];
	const visit = (dirPath: string): void => {
		for (const entry of readdirSync(dirPath, { withFileTypes: true })) {
			const entryPath = resolve(dirPath, entry.name);
			if (entry.isDirectory()) {
				visit(entryPath);
				continue;
			}
			if (entry.isFile() && SOURCE_EXTENSIONS.has(extname(entry.name))) {
				results.push(toPosix(entryPath));
			}
		}
	};
	visit(root);
	return results;
};

const escapeRegex = (value: string): string =>
	value.replace(/[|\\{}()[\]^$+?.]/g, '\\$&');

const globToRegExp = (glob: string): RegExp => {
	const normalized = toPosix(glob);
	let pattern = '';
	for (let index = 0; index < normalized.length; index += 1) {
		const char = normalized[index] ?? '';
		if (char === '*') {
			const next = normalized[index + 1];
			if (next === '*') {
				pattern += '.*';
				index += 1;
				continue;
			}
			pattern += '[^/]*';
			continue;
		}
		if (char === '?') {
			pattern += '.';
			continue;
		}
		pattern += escapeRegex(char);
	}
	return new RegExp(`^${pattern}$`, 'u');
};

const globRoot = (glob: string): string => {
	const normalized = toPosix(glob);
	const segments = normalized.split('/');
	const staticSegments: string[] = [];
	for (const segment of segments) {
		if (/[*?]/u.test(segment)) {
			break;
		}
		staticSegments.push(segment);
	}
	if (staticSegments.length === 0) {
		return '.';
	}
	return staticSegments.join('/');
};

const expandSourceGlobs = (
	sourceGlobs: readonly string[],
	readFile: (path: string) => string | undefined,
): readonly string[] => {
	const matches = new Set<string>();
	for (const source of sourceGlobs) {
		const normalized = toPosix(source);
		if (/[*?]/u.test(normalized)) {
			const root = globRoot(normalized);
			if (!isDirectory(root)) {
				continue;
			}
			const matcher = globToRegExp(normalized);
			for (const filePath of walkFiles(root)) {
				if (matcher.test(toPosix(filePath))) {
					matches.add(toPosix(filePath));
				}
			}
			continue;
		}
		if (isDirectory(normalized)) {
			for (const filePath of walkFiles(normalized)) {
				matches.add(toPosix(filePath));
			}
			continue;
		}
		if (isFile(normalized) || readFile(normalized) !== undefined) {
			matches.add(normalized);
		}
	}
	return Array.from(matches).sort();
};

const scriptKindForPath = (path: string): number => {
	const extension = extname(path);
	if (extension === '.tsx') return tsCompiler.ScriptKind.TSX;
	if (extension === '.mts') return tsCompiler.ScriptKind.TS;
	if (extension === '.cts') return tsCompiler.ScriptKind.TS;
	return tsCompiler.ScriptKind.TS;
};

const hasExportModifier = (node: any): boolean =>
	(node.modifiers ?? []).some(
		(modifier: any) =>
			modifier.kind === tsCompiler.SyntaxKind.ExportKeyword,
	);

const collectFsImports = (sourceFile: any): IFsImportBindings => {
	const namespaceImports = new Set<string>();
	const namedImports = new Set<string>();
	tsCompiler.forEachChild(sourceFile, (node: any) => {
		if (!tsCompiler.isImportDeclaration(node)) {
			return;
		}
		const moduleName = node.moduleSpecifier
			.getText(sourceFile)
			.slice(1, -1);
		if (
			moduleName !== 'node:fs' &&
			moduleName !== 'node:fs/promises' &&
			moduleName !== 'fs' &&
			moduleName !== 'fs/promises'
		) {
			return;
		}
		const clause = node.importClause;
		if (clause?.name !== undefined) {
			namedImports.add(clause.name.text);
		}
		const bindings = clause?.namedBindings;
		if (bindings === undefined) {
			return;
		}
		if (tsCompiler.isNamespaceImport(bindings)) {
			namespaceImports.add(bindings.name.text);
			return;
		}
		for (const element of bindings.elements) {
			namedImports.add(element.name.text);
		}
	});
	return { namespaceImports, namedImports };
};

const rootIdentifierText = (expression: any): string | null => {
	if (tsCompiler.isIdentifier(expression)) {
		return expression.text;
	}
	if (tsCompiler.isPropertyAccessExpression(expression)) {
		return rootIdentifierText(expression.expression);
	}
	if (tsCompiler.isElementAccessExpression(expression)) {
		return rootIdentifierText(expression.expression);
	}
	return null;
};

const isConsoleCall = (expression: any): boolean =>
	tsCompiler.isPropertyAccessExpression(expression) &&
	tsCompiler.isIdentifier(expression.expression) &&
	expression.expression.text === 'console';

const functionHasSideEffects = (
	body: any,
	fsImports: IFsImportBindings,
): boolean => {
	if (body === undefined) {
		return true;
	}
	let hasEffects = false;
	const visit = (node: any): void => {
		if (hasEffects) {
			return;
		}
		if (tsCompiler.isCallExpression(node)) {
			const expression = node.expression;
			if (tsCompiler.isIdentifier(expression)) {
				if (
					expression.text === 'require' ||
					fsImports.namedImports.has(expression.text)
				) {
					hasEffects = true;
					return;
				}
			}
			if (isConsoleCall(expression)) {
				tsCompiler.forEachChild(node, visit);
				return;
			}
			const root = rootIdentifierText(expression);
			if (root !== null && fsImports.namespaceImports.has(root)) {
				hasEffects = true;
				return;
			}
		}
		tsCompiler.forEachChild(node, visit);
	};
	visit(body);
	return hasEffects;
};

const analyzeTypeNode = (typeNode: any): IAnalyzedType => {
	if (typeNode === undefined) {
		return {
			schema: 'z.unknown()',
			isObjectLiteral: false,
			wrapInResult: true,
			supported: true,
		};
	}
	if (tsCompiler.isParenthesizedTypeNode(typeNode)) {
		return analyzeTypeNode(typeNode.type);
	}
	if (tsCompiler.isTypeLiteralNode(typeNode)) {
		const properties: string[] = [];
		for (const member of typeNode.members) {
			if (
				!tsCompiler.isPropertySignature(member) ||
				member.type === undefined
			) {
				return {
					schema: 'z.unknown()',
					isObjectLiteral: false,
					wrapInResult: true,
					supported: false,
				};
			}
			const name =
				tsCompiler.isIdentifier(member.name) ||
				tsCompiler.isStringLiteral(member.name)
					? member.name.text
					: null;
			if (name === null) {
				return {
					schema: 'z.unknown()',
					isObjectLiteral: false,
					wrapInResult: true,
					supported: false,
				};
			}
			const analyzed = analyzeTypeNode(member.type);
			if (!analyzed.supported) {
				return analyzed;
			}
			const propertySchema = member.questionToken
				? `${analyzed.schema}.optional()`
				: analyzed.schema;
			properties.push(`${name}: ${propertySchema}`);
		}
		return {
			schema: `z.object({ ${properties.join(', ')} })`,
			isObjectLiteral: true,
			wrapInResult: false,
			supported: true,
		};
	}
	if (tsCompiler.isArrayTypeNode(typeNode)) {
		const element = analyzeTypeNode(typeNode.elementType);
		return {
			schema: `z.array(${element.schema})`,
			isObjectLiteral: false,
			wrapInResult: true,
			supported: element.supported,
		};
	}
	if (tsCompiler.isTupleTypeNode(typeNode)) {
		const items = typeNode.elements.map(
			(element: any) => analyzeTypeNode(element).schema,
		);
		return {
			schema: `z.tuple([${items.join(', ')}])`,
			isObjectLiteral: false,
			wrapInResult: true,
			supported: true,
		};
	}
	if (tsCompiler.isUnionTypeNode(typeNode)) {
		const remaining = typeNode.types.filter(
			(member: any) =>
				member.kind !== tsCompiler.SyntaxKind.UndefinedKeyword,
		);
		if (
			remaining.length === 1 &&
			remaining.length !== typeNode.types.length
		) {
			const inner = analyzeTypeNode(remaining[0]);
			return {
				...inner,
				schema: `${inner.schema}.optional()`,
			};
		}
		return {
			schema: 'z.unknown()',
			isObjectLiteral: false,
			wrapInResult: true,
			supported: true,
		};
	}
	if (tsCompiler.isLiteralTypeNode(typeNode)) {
		if (tsCompiler.isStringLiteral(typeNode.literal)) {
			return {
				schema: `z.literal(${JSON.stringify(typeNode.literal.text)})`,
				isObjectLiteral: false,
				wrapInResult: true,
				supported: true,
			};
		}
		if (tsCompiler.isNumericLiteral(typeNode.literal)) {
			return {
				schema: `z.literal(${typeNode.literal.text})`,
				isObjectLiteral: false,
				wrapInResult: true,
				supported: true,
			};
		}
		if (typeNode.literal.kind === tsCompiler.SyntaxKind.TrueKeyword) {
			return {
				schema: 'z.literal(true)',
				isObjectLiteral: false,
				wrapInResult: true,
				supported: true,
			};
		}
		if (typeNode.literal.kind === tsCompiler.SyntaxKind.FalseKeyword) {
			return {
				schema: 'z.literal(false)',
				isObjectLiteral: false,
				wrapInResult: true,
				supported: true,
			};
		}
	}
	if (tsCompiler.isTypeReferenceNode(typeNode)) {
		const typeName = typeNode.typeName.getText();
		if (typeName === 'Array' || typeName === 'ReadonlyArray') {
			const first = typeNode.typeArguments?.[0];
			const item = analyzeTypeNode(first);
			return {
				schema: `z.array(${item.schema})`,
				isObjectLiteral: false,
				wrapInResult: true,
				supported: item.supported,
			};
		}
		if (typeName === 'Promise') {
			const inner = analyzeTypeNode(typeNode.typeArguments?.[0]);
			return inner;
		}
		if (typeName === 'String') {
			return {
				schema: 'z.string()',
				isObjectLiteral: false,
				wrapInResult: true,
				supported: true,
			};
		}
		if (typeName === 'Number') {
			return {
				schema: 'z.number()',
				isObjectLiteral: false,
				wrapInResult: true,
				supported: true,
			};
		}
		if (typeName === 'Boolean') {
			return {
				schema: 'z.boolean()',
				isObjectLiteral: false,
				wrapInResult: true,
				supported: true,
			};
		}
		return {
			schema: 'z.unknown()',
			isObjectLiteral: false,
			wrapInResult: true,
			supported: true,
		};
	}
	if (typeNode.kind === tsCompiler.SyntaxKind.StringKeyword) {
		return {
			schema: 'z.string()',
			isObjectLiteral: false,
			wrapInResult: true,
			supported: true,
		};
	}
	if (typeNode.kind === tsCompiler.SyntaxKind.NumberKeyword) {
		return {
			schema: 'z.number()',
			isObjectLiteral: false,
			wrapInResult: true,
			supported: true,
		};
	}
	if (typeNode.kind === tsCompiler.SyntaxKind.BooleanKeyword) {
		return {
			schema: 'z.boolean()',
			isObjectLiteral: false,
			wrapInResult: true,
			supported: true,
		};
	}
	if (typeNode.kind === tsCompiler.SyntaxKind.BigIntKeyword) {
		return {
			schema: 'z.bigint()',
			isObjectLiteral: false,
			wrapInResult: true,
			supported: true,
		};
	}
	if (typeNode.kind === tsCompiler.SyntaxKind.VoidKeyword) {
		return {
			schema: 'z.object({})',
			isObjectLiteral: true,
			wrapInResult: false,
			supported: true,
		};
	}
	if (
		typeNode.kind === tsCompiler.SyntaxKind.AnyKeyword ||
		typeNode.kind === tsCompiler.SyntaxKind.UnknownKeyword
	) {
		return {
			schema: 'z.unknown()',
			isObjectLiteral: false,
			wrapInResult: true,
			supported: true,
		};
	}
	return {
		schema: 'z.unknown()',
		isObjectLiteral: false,
		wrapInResult: true,
		supported: true,
	};
};

const analyzeReturnType = (typeNode: any): IReturnAnalysis => {
	const isPromise =
		typeNode !== undefined &&
		tsCompiler.isTypeReferenceNode(typeNode) &&
		typeNode.typeName.getText() === 'Promise';
	const inner = analyzeTypeNode(
		isPromise && tsCompiler.isTypeReferenceNode(typeNode)
			? typeNode.typeArguments?.[0]
			: typeNode,
	);
	if (!inner.supported) {
		return {
			awaitResult: isPromise,
			outputSchema: 'z.object({ result: z.unknown() })',
			outputExpression: '{ result }',
			supported: false,
		};
	}
	if (inner.isObjectLiteral) {
		return {
			awaitResult: isPromise,
			outputSchema: inner.schema,
			outputExpression: 'result',
			supported: true,
		};
	}
	if (typeNode?.kind === tsCompiler.SyntaxKind.VoidKeyword) {
		return {
			awaitResult: false,
			outputSchema: 'z.object({})',
			outputExpression: '{}',
			supported: true,
		};
	}
	return {
		awaitResult: isPromise,
		outputSchema: `z.object({ result: ${inner.schema} })`,
		outputExpression: '{ result }',
		supported: true,
	};
};

const collectFunctionCandidates = (
	sourceFile: any,
): readonly IFunctionCandidate[] => {
	const candidates: IFunctionCandidate[] = [];
	tsCompiler.forEachChild(sourceFile, (node: any) => {
		if (
			tsCompiler.isFunctionDeclaration(node) &&
			hasExportModifier(node) &&
			node.name !== undefined
		) {
			candidates.push({
				exportName: node.name.text,
				body: node.body,
				parameters: node.parameters,
				returnType: node.type,
			});
			return;
		}
		if (!tsCompiler.isVariableStatement(node) || !hasExportModifier(node)) {
			return;
		}
		for (const declaration of node.declarationList.declarations) {
			if (!tsCompiler.isIdentifier(declaration.name)) {
				continue;
			}
			const initializer = declaration.initializer;
			if (
				initializer === undefined ||
				(!tsCompiler.isArrowFunction(initializer) &&
					!tsCompiler.isFunctionExpression(initializer))
			) {
				continue;
			}
			candidates.push({
				exportName: declaration.name.text,
				body: tsCompiler.isBlock(initializer.body)
					? initializer.body
					: undefined,
				parameters: initializer.parameters,
				returnType: initializer.type,
			});
		}
	});
	return candidates;
};

const buildInputSchema = (
	parameters: readonly any[],
):
	| { readonly schema: string; readonly callArgs: readonly string[] }
	| SkipReason => {
	const props: string[] = [];
	const callArgs: string[] = [];
	for (const parameter of parameters) {
		if (!tsCompiler.isIdentifier(parameter.name)) {
			return 'unsupported-shape';
		}
		if (parameter.type === undefined) {
			return 'untyped-parameter';
		}
		const analyzed = analyzeTypeNode(parameter.type);
		if (!analyzed.supported) {
			return 'unsupported-shape';
		}
		const propSchema = parameter.questionToken
			? `${analyzed.schema}.optional()`
			: analyzed.schema;
		props.push(`${parameter.name.text}: ${propSchema}`);
		callArgs.push(`input.${parameter.name.text}`);
	}
	return {
		schema: `z.object({ ${props.join(', ')} })`,
		callArgs,
	};
};

const relativeImportPath = (fromFile: string, toFile: string): string => {
	const raw = withoutTypeExtension(
		toPosix(relative(dirname(fromFile), toFile)),
	);
	if (raw.startsWith('.')) {
		return raw;
	}
	return `./${raw}`;
};

const buildStubBody = (
	exportName: string,
	callArgs: readonly string[],
	returnAnalysis: IReturnAnalysis,
): string => {
	const invoke = returnAnalysis.awaitResult
		? `const result = await ${exportName}(${callArgs.join(', ')});`
		: `const result = ${exportName}(${callArgs.join(', ')});`;
	return `// TODO: confirm the extracted wrapper for ${exportName} before shipping this plugin.
const input = INPUT_SCHEMA.parse(rawArgs);
${invoke}
const payload = OUTPUT_SCHEMA.parse(${returnAnalysis.outputExpression});
return {
	content: [
		{
			type: 'text' as const,
			text: JSON.stringify(payload, null, '\t'),
		},
	],
};`;
};

const buildToolFile = (
	pluginId: string,
	candidate: IExtractCandidate,
): string => `import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import { ${candidate.exportName} } from '${candidate.importPath}';

export const INPUT_SCHEMA = ${candidate.inputZod};
export const OUTPUT_SCHEMA = ${candidate.outputZod};

export async function ${candidate.registerName}(
	server: McpServer,
	prefix: string,
): Promise<void> {
	server.registerTool(
		\`${'${prefix}'}_${candidate.name}\`,
		{
			description: 'TODO: confirm extracted wrapper for ${candidate.exportName}.',
			inputSchema: INPUT_SCHEMA,
		},
		async (rawArgs) => {
			${candidate.stubBody.replace(/\n/g, '\n\t\t\t')}
		},
	);
}

export const TOOL_ID = '${pluginId}_${candidate.name}';
`;

const buildToolSpec = (
	candidate: IExtractCandidate,
): string => `import { describe, expect, it } from 'vitest';

import { INPUT_SCHEMA, OUTPUT_SCHEMA } from '../../../../src/lib/tools/${candidate.name}.tool';

describe('${candidate.name} extracted scaffold', () => {
	it('keeps the generated schemas as TODO-backed placeholders', () => {
		expect(INPUT_SCHEMA).toBeDefined();
		expect(OUTPUT_SCHEMA).toBeDefined();
	});
});
`;

const buildPluginIndex = (
	pluginId: string,
	pluginName: string,
	description: string,
	tools: readonly IExtractCandidate[],
): string => {
	const imports = tools
		.map(
			(tool) =>
				`import { ${tool.registerName} } from './lib/tools/${tool.name}.tool';`,
		)
		.join('\n');
	const toolEntries = tools
		.map(
			(tool) => `				{
					id: '${tool.pluginToolId}',
					register: async (server) => ${tool.registerName}(server, prefix),
				}`,
		)
		.join(',\n');
	const knowledgeEntries = tools
		.map(
			(tool) => `				{
					id: '${tool.name}-overview',
					title: '${tool.knowledgeTitle.replace(/'/g, '')}',
					body: '${tool.toolDescription.replace(/'/g, '')}',
				}`,
		)
		.join(',\n');
	return `import { definePlugin } from '@mcp-vertex/core/public';
${imports === '' ? '' : `${imports}\n`}

export default definePlugin({
	name: '${pluginId}',
	version: '0.1.0',
	describe: '${description.replace(/'/g, '')}',
	register(ctx) {
		const prefix = ctx.namespacePrefix;
		return {
			tools: [
${toolEntries}
			],
			knowledge: [
${knowledgeEntries === '' ? `				{ id: '${pluginId}-overview', title: '${pluginName.replace(/'/g, '')}', body: '${description.replace(/'/g, '')}' }` : knowledgeEntries}
			],
		};
	},
});
`;
};

const mergeFiles = (
	baseFiles: readonly IScaffoldedFile[],
	updates: readonly IScaffoldedFile[],
): readonly IScaffoldedFile[] => {
	const merged = new Map<string, string>();
	for (const file of baseFiles) {
		merged.set(file.path, file.content);
	}
	for (const file of updates) {
		merged.set(file.path, file.content);
	}
	return Array.from(merged.entries())
		.sort(([left], [right]) => left.localeCompare(right))
		.map(([path, content]) => ({ path, content }));
};

export function extractPlugin(
	opts: IExtractPluginOptions,
): IExtractPluginResult {
	const readFile = opts.readFile ?? defaultReadFile;
	const pluginId = kebab(opts.targetPluginId);
	const discoveredFiles = expandSourceGlobs(opts.sourceGlobs, readFile);
	const tools: IExtractCandidate[] = [];
	const skippedExports: Array<{
		readonly name: string;
		readonly reason: SkipReason;
	}> = [];

	for (const sourcePath of discoveredFiles) {
		const content = readFile(sourcePath);
		if (content === undefined) {
			continue;
		}
		const sourceFile = tsCompiler.createSourceFile(
			sourcePath,
			content,
			tsCompiler.ScriptTarget.Latest,
			true,
			scriptKindForPath(sourcePath),
		);
		const fsImports = collectFsImports(sourceFile);
		for (const candidate of collectFunctionCandidates(sourceFile)) {
			if (functionHasSideEffects(candidate.body, fsImports)) {
				skippedExports.push({
					name: candidate.exportName,
					reason: 'has-side-effects',
				});
				continue;
			}
			const input = buildInputSchema(candidate.parameters);
			if (typeof input === 'string') {
				skippedExports.push({
					name: candidate.exportName,
					reason: input,
				});
				continue;
			}
			const returnAnalysis = analyzeReturnType(candidate.returnType);
			if (!returnAnalysis.supported) {
				skippedExports.push({
					name: candidate.exportName,
					reason: 'unsupported-shape',
				});
				continue;
			}
			const toolName = snake(candidate.exportName);
			const registerName = `register${pascal(candidate.exportName)}Tool`;
			const stubFilePath = `plugins/${pluginId}/src/lib/tools/${toolName}.tool.ts`;
			const extracted: IExtractCandidate = {
				exportName: candidate.exportName,
				toolName,
				name: toolName,
				sourcePath,
				registerName,
				toolConstName: `${toolName.toUpperCase()}_TOOL`,
				importPath: relativeImportPath(stubFilePath, sourcePath),
				inputZod: input.schema,
				outputZod: returnAnalysis.outputSchema,
				stubBody: buildStubBody(
					candidate.exportName,
					input.callArgs,
					returnAnalysis,
				),
				stubFilePath,
				testFilePath: `plugins/${pluginId}/tests/src/lib/${toolName}.spec.ts`,
				toolSource: '',
				testSource: '',
				toolDescription: `Extracted wrapper for ${candidate.exportName} from ${sourcePath}.`,
				knowledgeTitle: `${opts.pluginName} · ${candidate.exportName}`,
				pluginToolId: `${pluginId}_${toolName}`,
				isMarkedTodo: true,
			};
			const completed = {
				...extracted,
				toolSource: buildToolFile(pluginId, extracted),
				testSource: buildToolSpec(extracted),
			};
			tools.push(completed);
		}
	}

	const scaffoldFiles = scaffoldPluginFiles({
		pluginName: pluginId,
		description: opts.description,
	});
	const baseWithoutPing = scaffoldFiles.filter(
		(file) =>
			file.path !== `plugins/${pluginId}/tests/src/lib/ping.spec.ts`,
	);
	const generatedFiles: IScaffoldedFile[] = [
		{
			path: `plugins/${pluginId}/src/index.ts`,
			content: buildPluginIndex(
				pluginId,
				opts.pluginName,
				opts.description,
				tools,
			),
		},
		...tools.map((tool) => ({
			path: tool.stubFilePath,
			content: tool.toolSource,
		})),
		...tools.map((tool) => ({
			path: tool.testFilePath,
			content: tool.testSource,
		})),
	];
	const files = mergeFiles(baseWithoutPing, generatedFiles);

	return {
		targetPluginId: pluginId,
		files,
		tools: tools.map((tool) => ({
			name: tool.name,
			exportName: tool.exportName,
			sourcePath: tool.sourcePath,
			inputZod: tool.inputZod,
			outputZod: tool.outputZod,
			stubBody: tool.stubBody,
			isMarkedTodo: true,
		})),
		skippedExports,
	};
}
