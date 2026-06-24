import { z } from 'zod';

import {
	toolJson,
	type IFileReader,
	type IToolRegistration,
	type IToolTextResult,
} from '@mcp-vertex/core/public';

import type { ITestConvention } from '../../convention';
import { scanDrift } from '../../scan';

export interface IScanDriftOptions {
	readonly namespacePrefix: string;
	readonly convention: ITestConvention;
	readonly reader: IFileReader;
	readonly workspaceRoot: string;
}

const InputSchema = z.object({
	scope: z
		.enum(['all', 'src', 'tests'])
		.optional()
		.describe('Which tree to scan; defaults to "all".'),
	maxFiles: z
		.number()
		.int()
		.positive()
		.max(5000)
		.optional()
		.describe('Hard cap to keep the report token-friendly; default 500.'),
});

const ViolationSchema = z.object({
	id: z.string(),
	file: z.string(),
	severity: z.enum(['error', 'warning', 'info']),
	hint: z.string(),
	line: z.number().optional(),
	excerpt: z.string().optional(),
});

const OutputSchema = z.object({
	ok: z.boolean(),
	counts: z.object({
		error: z.number(),
		warning: z.number(),
		info: z.number(),
	}),
	violations: z.array(ViolationSchema),
	scannedFiles: z.number(),
});

/**
 * `<prefix>_scan_drift` — walk the workspace, compare specs and
 * sources against the convention, return a structured drift report.
 * `ok === true` only when there are zero `error` severities.
 */
export const buildScanDrift = (
	options: IScanDriftOptions,
): IToolRegistration => {
	const prefix = options.namespacePrefix;
	return {
		id: 'scan_drift',
		summary:
			'Audit specs and sources for violations of the test convention; returns { ok, counts, violations, scannedFiles }.',
		tags: ['testing', 'convention', 'audit'],
		register: async (server) => {
			server.registerTool(
				`${prefix}_scan_drift`,
				{
					description:
						'Scans `src/` and `tests/` (or just one of them with `scope`) for violations of the canonical test convention: wrong spec extension, missing spec companion, orphan imports, missing top-level describe, forbidden patterns (.only, xit, @ts-ignore, console.log), wrong mock API, empty describe names. Returns a structured report; `ok === true` only when there are zero errors.',
					inputSchema: InputSchema,
					outputSchema: OutputSchema,
				},
				async (args): Promise<IToolTextResult> =>
					toolJson(
						await scanDrift({
							convention: options.convention,
							reader: options.reader,
							workspaceRoot: options.workspaceRoot,
							...(args.scope !== undefined
								? { scope: args.scope }
								: {}),
							...(args.maxFiles !== undefined
								? { maxFiles: args.maxFiles }
								: {}),
						}),
					),
			);
		},
	};
};
