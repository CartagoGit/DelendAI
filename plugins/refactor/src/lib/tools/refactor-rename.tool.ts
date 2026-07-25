/**
 * f00123 S2 — `refactor_rename` (planner) + `refactor_apply` (consented writer).
 */
import { readFile, writeFile } from 'node:fs/promises';
import { isAbsolute, join, relative, resolve } from 'node:path';

import { z } from 'zod';

import type { IToolRegistration } from '@mcp-vertex/core/public';
import { toolError, toolJson } from '@mcp-vertex/core/public';

import {
	formatPlanDiff,
	planRename,
	type IRenamePlan,
} from '../rename/rename-planner';

export interface IRefactorRenameToolOptions {
	readonly namespacePrefix: string;
	readonly workspaceRootAbs: string;
	readonly readFile?: (absPath: string) => Promise<string>;
	readonly writeFile?: (absPath: string, content: string) => Promise<void>;
}

const RENAME_OUTPUT_SCHEMA = z.object({
	ok: z.literal(true),
	hits: z.number().int().nonnegative(),
	diff: z.string(),
});

const RENAME_ERROR_SCHEMA = z.object({
	ok: z.literal(false),
	code: z.string(),
	message: z.string(),
});

const APPLY_OUTPUT_SCHEMA = z.object({
	ok: z.literal(true),
	filesWritten: z.number().int().nonnegative(),
});

const APPLY_ERROR_SCHEMA = z.object({
	ok: z.literal(false),
	code: z.string(),
	message: z.string(),
});

const REQUIRE_KIND = z
	.enum(['function', 'class', 'interface', 'type', 'variable', 'enum'])
	.optional();

const RENAME_INPUT = z.object({
	from: z.string().min(1),
	oldName: z.string().min(1),
	newName: z.string().min(1),
	requireKind: REQUIRE_KIND,
});

const requireContainment = (root: string, file: string): string => {
	const abs = isAbsolute(file) ? file : join(root, file);
	const rel = relative(root, resolve(root, abs));
	if (rel.startsWith('..') || isAbsolute(rel)) {
		throw new Error(`path "${file}" escapes workspace root`);
	}
	return abs;
};

type ICollected =
	| { readonly ok: true; readonly source: string }
	| { readonly ok: false; readonly error: ReturnType<typeof toolError> };

const collectSources = async (
	from: string,
	root: string,
	read: (abs: string) => Promise<string>,
): Promise<ICollected> => {
	try {
		const abs = requireContainment(root, from);
		return { ok: true, source: await read(abs) };
	} catch (err) {
		return {
			ok: false,
			error: toolError(`cannot read "${from}"`, (err as Error).message),
		};
	}
};

const buildPlan = (
	args: {
		from: string;
		oldName: string;
		newName: string;
		requireKind?:
			| 'function'
			| 'class'
			| 'interface'
			| 'type'
			| 'variable'
			| 'enum'
			| undefined;
	},
	source: string,
): IRenamePlan =>
	planRename(
		{
			from: args.from,
			oldName: args.oldName,
			newName: args.newName,
			...(args.requireKind !== undefined
				? { requireKind: args.requireKind }
				: {}),
		},
		{ [args.from]: source },
	);

export const buildRefactorRenameToolRegistrations = (
	options: IRefactorRenameToolOptions,
): readonly IToolRegistration[] => {
	const prefix = options.namespacePrefix;
	const read = options.readFile ?? ((p: string) => readFile(p, 'utf8'));
	const write =
		options.writeFile ??
		((p: string, c: string) => writeFile(p, c, 'utf8'));

	return [
		{
			id: 'refactor_rename',
			summary:
				'Plan a scoped single-file rename; returns a unified diff.',
			tags: ['refactor', 'lazy'],
			register: async (server) => {
				server.registerTool(
					`${prefix}_refactor_rename`,
					{
						description:
							'Compute a scoped rename of `oldName` → `newName` in `from`. Returns a unified diff (dry-run); no file is modified. Call `refactor_apply` to actually write after reviewing the diff.',
						inputSchema: RENAME_INPUT,
						outputSchema: z.union([
							RENAME_OUTPUT_SCHEMA,
							RENAME_ERROR_SCHEMA,
						]),
					},
					async (args) => {
						const collected = await collectSources(
							args.from,
							options.workspaceRootAbs,
							read,
						);
						if (collected.ok === false) return collected.error;
						const plan = buildPlan(args, collected.source);
						if (!plan.ok) {
							return toolError(
								plan.message,
								`code: ${plan.code}`,
							);
						}
						return toolJson({
							ok: true as const,
							hits: plan.hits,
							diff: formatPlanDiff(plan),
						});
					},
				);
			},
		},
		{
			id: 'refactor_apply',
			summary:
				'Apply a previously-planned rename diff (writes through fs-containment, runs the gate).',
			tags: ['refactor'],
			register: async (server) => {
				server.registerTool(
					`${prefix}_refactor_apply`,
					{
						description:
							'Apply the rename of `oldName` → `newName` in `from` (writes the file inside the workspace root). Pair with `refactor_rename`: the planner is pure, the apply step requires a separate explicit call so the user can review the diff first.',
						inputSchema: RENAME_INPUT,
						outputSchema: z.union([
							APPLY_OUTPUT_SCHEMA,
							APPLY_ERROR_SCHEMA,
						]),
					},
					async (args) => {
						const collected = await collectSources(
							args.from,
							options.workspaceRootAbs,
							read,
						);
						if (collected.ok === false) return collected.error;
						const plan = buildPlan(args, collected.source);
						if (!plan.ok) {
							return toolError(
								plan.message,
								`code: ${plan.code}`,
							);
						}
						const patch = plan.patches[0];
						if (patch === undefined) {
							return toolError(
								'plan has no patches',
								'internal planner bug',
							);
						}
						const abs = requireContainment(
							options.workspaceRootAbs,
							args.from,
						);
						await write(abs, patch.newContent);
						return toolJson({ ok: true as const, filesWritten: 1 });
					},
				);
			},
		},
	];
};
