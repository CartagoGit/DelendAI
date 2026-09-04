/**
 * perf-profile.tool.ts — `perf_profile`: probe for a profiler, capture a
 * bounded hotspot summary when possible and degrade gracefully to `skipped`
 * when the host has no profiling toolchain available.
 */
import z from 'zod';

import type { IToolRegistration } from '@delendai/core/public';
import {
	resolveWorkspaceContained,
	summarizeFindings,
	toolError,
	toolJson,
	worstSeverity,
} from '@delendai/core/public';

import type {
	IHotspot,
	IPerfProfileCaptureInput,
	IPerfProfileToolOptions,
} from '../contracts/interfaces/perf.interface';
import { realPerfProfileDeps } from '../profile/real-perf-profile-deps';
import { runProfileCapture } from '../profile/run-profile-capture';

const HotspotSchema = z.object({
	name: z.string(),
	message: z.string(),
	severity: z
		.enum(['critical', 'high', 'medium', 'low', 'info'])
		.exclude(['critical']),
	selfPercent: z.number().nonnegative(),
	totalPercent: z.number().nonnegative(),
	samples: z.number().int().nonnegative(),
});

const summarizeHotspots = (hotspots: readonly IHotspot[]) =>
	summarizeFindings(
		hotspots.map((hotspot) => ({
			ruleId: 'profile-hotspot',
			severity: hotspot.severity,
			message: hotspot.message,
		})),
	);

const hotspotWorst = (hotspots: readonly IHotspot[]): string =>
	worstSeverity(
		hotspots.map((hotspot) => ({
			ruleId: 'profile-hotspot',
			severity: hotspot.severity,
			message: hotspot.message,
		})),
	) ?? 'none';

export const buildPerfProfileRegistration = (
	options: IPerfProfileToolOptions,
): IToolRegistration => ({
	id: 'perf_profile',
	summary:
		'Capture a bounded hotspot profile when a profiler is available, else skip with an install hint.',
	tags: ['perf', 'quality'],
	register: async (server) => {
		server.registerTool(
			`${options.namespacePrefix}_perf_profile`,
			{
				description:
					'Probe for a profiler toolchain, capture a short hotspot summary against the workspace and return normalized hotspots. When no profiler is present, the tool skips with an install hint instead of crashing.',
				inputSchema: z
					.object({
						cwd: z.string().optional(),
						timeoutMs: z.number().int().positive().optional(),
						format: z.enum(['hotspots', 'flamegraph']).optional(),
					})
					.strict(),
				outputSchema: z.discriminatedUnion('ok', [
					z.object({
						ok: z.literal(true),
						profiler: z.string(),
						hotspots: z.array(HotspotSchema),
						summary: z.object({
							critical: z.number(),
							high: z.number(),
							medium: z.number(),
							low: z.number(),
							info: z.number(),
						}),
						worst: z.string(),
					}),
					z.object({
						ok: z.literal('skipped'),
						hint: z.string(),
					}),
				]),
			},
			async (args: {
				cwd?: string | undefined;
				timeoutMs?: number | undefined;
				format?: 'hotspots' | 'flamegraph' | undefined;
			}) => {
				let cwd = options.workspaceRootAbs;
				if (args.cwd !== undefined) {
					const contained = resolveWorkspaceContained(
						options.workspaceRootAbs,
						args.cwd,
					);
					if (!contained.ok) {
						return toolError(
							`cwd "${args.cwd}" is not allowed`,
							contained.reason ??
								'cwd must be a workspace-relative path.',
						);
					}
					cwd = contained.abs;
				}
				const deps =
					options.deps ??
					realPerfProfileDeps(
						options.workspaceRootAbs,
						options.pluginCacheDir !== undefined
							? { pluginCacheDir: options.pluginCacheDir }
							: {},
					);
				const input: IPerfProfileCaptureInput = {
					cwd,
					timeoutMs: args.timeoutMs ?? 2_500,
					format: args.format ?? 'hotspots',
				};
				const result = await (
					options.runProfileCapture ?? runProfileCapture
				)(input, deps);
				if (result.ok === 'skipped') {
					return toolJson(result);
				}
				if (result.ok === false) {
					return toolError(result.message, result.hint);
				}
				return toolJson({
					ok: true,
					profiler: result.profiler,
					hotspots: result.hotspots,
					summary: summarizeHotspots(result.hotspots),
					worst: hotspotWorst(result.hotspots),
				});
			},
		);
	},
});
