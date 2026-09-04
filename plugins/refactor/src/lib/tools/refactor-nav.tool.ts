/**
 * f00123 S1 — `refactor_references`, `refactor_definition`, `refactor_symbols`.
 *
 * Thin tools that delegate to the pure `buildNavEngine`. The file reader is
 * injectable (tests use a `Map`; production reads from disk via the
 * containment-bounded path the host resolves). Output is the same
 * `{file,line,column,kind,name,isDefinition}` projection so an LLM agent
 * can ground rename/codemod decisions in the AST.
 */
import z from 'zod';

import { basename, dirname } from 'node:path';

import type { IToolRegistration } from '@delendai/core/public';
import {
	SafeWorkspaceReader,
	resolveWorkspaceContained,
	toolError,
	toolJson,
} from '@delendai/core/public';

import {
	buildNavEngine,
	parseSourceFile,
	type INavHit,
} from '../nav/nav-engine';

export interface IRefactorNavToolOptions {
	readonly namespacePrefix: string;
	/** Workspace root — every `path` is resolved against it. */
	readonly workspaceRootAbs: string;
	/** Injectable file reader; defaults to `fs/promises.readFile`. */
	readonly readFile?: (absPath: string) => Promise<string>;
}

const hitSchema = z.object({
	file: z.string(),
	line: z.number().int().positive(),
	column: z.number().int().positive(),
	kind: z.string(),
	name: z.string(),
	isDefinition: z.boolean(),
});

const NAV_OUTPUT_SCHEMA = z.object({
	hits: z.array(hitSchema),
});

const DEFINITION_OUTPUT_SCHEMA = z.object({
	hit: hitSchema.nullable(),
});

const SYMBOLS_OUTPUT_SCHEMA = z.object({
	hits: z.array(hitSchema),
});

export const buildRefactorNavToolRegistrations = (
	options: IRefactorNavToolOptions,
): readonly IToolRegistration[] => {
	const prefix = options.namespacePrefix;
	const read =
		options.readFile ??
		(async (p: string) =>
			(await new SafeWorkspaceReader(dirname(p)).readText(basename(p)))
				.content);

	const loadEngine = async (path: string) => {
		// x00184 (F17): `path` used to be passed straight through when it
		// started with "/" — an absolute `path` (e.g. `/etc/shadow`) was
		// read verbatim, with zero containment check.
		const contained = resolveWorkspaceContained(
			options.workspaceRootAbs,
			path,
		);
		if (!contained.ok) {
			return {
				error: toolError(
					`path "${path}" is not allowed`,
					contained.reason ??
						'Path must stay inside the workspace root.',
				),
			};
		}
		const abs = contained.abs;
		try {
			const source = await read(abs);
			return {
				engine: buildNavEngine(abs, parseSourceFile(abs, source)),
			};
		} catch (err) {
			return {
				error: toolError(
					`cannot read "${path}"`,
					(err as Error).message,
				),
			};
		}
	};

	return [
		{
			id: 'refactor_references',
			summary:
				'AST references of a symbol across one file (or a tiny set).',
			tags: ['refactor', 'lazy'],
			register: async (server) => {
				server.registerTool(
					`${prefix}_refactor_references`,
					{
						description:
							'List every identifier occurrence of `name` in `path`, including the declaration site. AST-based via the `typescript` compiler API — no regex.',
						inputSchema: z.object({
							path: z.string().min(1),
							name: z.string().min(1),
						}),
						outputSchema: NAV_OUTPUT_SCHEMA,
					},
					async (args) => {
						const { engine, error } = await loadEngine(args.path);
						if (error !== undefined) return error;
						const hits: readonly INavHit[] = engine.findReferences(
							args.name,
						);
						return toolJson({ hits });
					},
				);
			},
		},
		{
			id: 'refactor_definition',
			summary: 'AST definition of a symbol in one file.',
			tags: ['refactor', 'lazy'],
			register: async (server) => {
				server.registerTool(
					`${prefix}_refactor_definition`,
					{
						description:
							'Return the first declaration site of `name` in `path`, or `null` if the symbol is not declared there. AST-based.',
						inputSchema: z.object({
							path: z.string().min(1),
							name: z.string().min(1),
						}),
						outputSchema: DEFINITION_OUTPUT_SCHEMA,
					},
					async (args) => {
						const { engine, error } = await loadEngine(args.path);
						if (error !== undefined) return error;
						const hit = engine.findDefinition(args.name) ?? null;
						return toolJson({ hit });
					},
				);
			},
		},
		{
			id: 'refactor_symbols',
			summary: 'AST top-level exported symbols of a file.',
			tags: ['refactor', 'lazy'],
			register: async (server) => {
				server.registerTool(
					`${prefix}_refactor_symbols`,
					{
						description:
							'List every top-level exported declaration in `path` (functions, classes, interfaces, type aliases, enums, exported variables). AST-based.',
						inputSchema: z.object({
							path: z.string().min(1),
						}),
						outputSchema: SYMBOLS_OUTPUT_SCHEMA,
					},
					async (args) => {
						const { engine, error } = await loadEngine(args.path);
						if (error !== undefined) return error;
						const hits: readonly INavHit[] = engine.listSymbols();
						return toolJson({ hits });
					},
				);
			},
		},
	];
};
