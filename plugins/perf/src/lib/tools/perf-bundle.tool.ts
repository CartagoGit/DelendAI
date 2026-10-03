/**
 * perf-bundle.tool.ts — `perf_bundle`: measure files matching globs and flag
 * those over per-file / total byte budgets. Composes the r00012 finding
 * helpers; the sizer is injectable, so the tool is testable. Offline.
 */
import z from 'zod';

import type { IToolRegistration } from '@delendai/core/public';
import {
	sortFindings,
	summarizeFindings,
	toolJson,
	worstSeverity,
} from '@delendai/core/public';

import type {
	IPerfBudgets,
	IPerfBundleToolOptions,
} from '../contracts/interfaces/perf.interface';
import { checkBudgets, totalBytes } from '../perf/check-budgets';
import { realPerfDeps } from '../perf/real-deps';

const FINDING = z.object({
	ruleId: z.string(),
	severity: z.enum(['critical', 'high', 'medium', 'low', 'info']),
	message: z.string(),
	fix: z.string().optional(),
	location: z
		.object({
			file: z.string(),
			line: z.number().optional(),
			endLine: z.number().optional(),
		})
		.optional(),
});

const DEFAULT_GLOBS = ['dist/**/*.js'];
/** How many of the largest files to include in the output. */
const TOP_N = 10;

export const buildPerfBundleRegistration = (
	options: IPerfBundleToolOptions,
): IToolRegistration => ({
	id: 'perf_bundle',
	summary:
		'Measure files matching globs and flag those over per-file / total byte budgets. Offline.',
	tags: ['perf', 'quality'],
	register: async (server) => {
		server.registerTool(
			`${options.namespacePrefix}_perf_bundle`,
			{
				description:
					'Measure build-output size: match files by glob (default `dist/**/*.js`) and flag any file over `maxFileKb` (file-over-budget) or a total over `maxTotalKb` (total-over-budget). With no budgets it just reports sizes (largest first). Offline, read-only.',
				inputSchema: z.object({
					globs: z.array(z.string()).optional(),
					maxFileKb: z.number().positive().optional(),
					maxTotalKb: z.number().positive().optional(),
				}),
				outputSchema: z.object({
					globs: z.array(z.string()),
					fileCount: z.number(),
					totalBytes: z.number(),
					largest: z.array(
						z.object({ path: z.string(), bytes: z.number() }),
					),
					findings: z.array(FINDING),
					summary: z.object({
						critical: z.number(),
						high: z.number(),
						medium: z.number(),
						low: z.number(),
						info: z.number(),
					}),
					worst: z.string(),
				}),
			},
			async (args: {
				globs?: string[] | undefined;
				maxFileKb?: number | undefined;
				maxTotalKb?: number | undefined;
			}) => {
				const globs =
					args.globs !== undefined && args.globs.length > 0
						? args.globs
						: DEFAULT_GLOBS;
				const deps =
					options.deps ?? realPerfDeps(options.workspaceRootAbs);
				const files = await deps.listSizes(globs);
				const budgets: IPerfBudgets = {
					...(args.maxFileKb !== undefined && {
						maxFileBytes: Math.round(args.maxFileKb * 1024),
					}),
					...(args.maxTotalKb !== undefined && {
						maxTotalBytes: Math.round(args.maxTotalKb * 1024),
					}),
				};
				const findings = sortFindings(checkBudgets(files, budgets));
				const largest = [...files]
					.sort((a, b) => b.bytes - a.bytes)
					.slice(0, TOP_N);
				return toolJson({
					globs,
					fileCount: files.length,
					totalBytes: totalBytes(files),
					largest,
					findings,
					summary: summarizeFindings(findings),
					worst: worstSeverity(findings) ?? 'none',
				});
			},
		);
	},
});
