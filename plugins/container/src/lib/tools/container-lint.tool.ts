/**
 * container-lint.tool.ts — f00133 S2: `container_logs` + `container_lint`.
 *
 * `container_lint` runs a hadolint-style Dockerfile lint over the
 * provided source. It probes hadolint on PATH and falls back to the
 * built-in rules (curated DLxxxx subset) when the binary is missing,
 * so the tool never returns an empty report just because hadolint is
 * not installed.
 *
 * `container_logs` tails logs from a running container or pod via the
 * matching docker / kubectl CLI. Read-only. Missing CLI returns a
 * structured `kind: 'skipped'` envelope with the install hint.
 */
import { z } from 'zod';

import type { IToolRegistration } from '@mcp-vertex/core/public';
import {
	probeTool,
	realProbeDeps,
	runExternalTool,
	toolJson,
} from '@mcp-vertex/core/public';

import type { IArgvExec, IProbeDeps } from '@mcp-vertex/core/public';
import {
	DOCKER_TOOL,
	HADO_LINT_TOOL,
	KUBECTL_TOOL,
} from '../inspect/cli-tools';
import { runDockerfileLint } from '../lint/run-lint';

export interface IContainerLintToolOptions {
	readonly namespacePrefix: string;
	readonly probeDeps?: IProbeDeps;
	readonly runExec?: IArgvExec;
}

const LINT_INPUT = z
	.object({
		source: z
			.string()
			.min(1)
			.max(64 * 1024),
	})
	.strict();

const LINT_OUTPUT = z.object({
	ok: z.literal(true),
	engine: z.enum(['hadolint', 'builtin', 'builtin-hadolint-failed']),
	hadolintAvailable: z.boolean(),
	findings: z.array(
		z.object({
			ruleId: z.string(),
			severity: z.enum(['critical', 'high', 'medium', 'low', 'info']),
			message: z.string(),
			location: z
				.object({ file: z.string(), line: z.number().optional() })
				.optional(),
			fix: z.string().optional(),
		}),
	),
});

const LOGS_INPUT = z
	.object({
		kind: z.enum(['docker', 'kubectl']),
		target: z.string().min(1).max(512),
		tail: z.number().int().positive().max(10_000).optional(),
		namespace: z.string().optional(),
	})
	.strict();

const LOGS_OUTPUT = z.object({
	ok: z.literal(true),
	kind: z.enum(['docker', 'kubectl']),
	target: z.string(),
	logs: z.string(),
});

const LOGS_SKIPPED = z.object({
	ok: z.literal(false),
	kind: z.literal('skipped'),
	hint: z.string(),
});

const LOGS_ALL = z.union([LOGS_OUTPUT, LOGS_SKIPPED]);

export const buildContainerLintToolRegistrations = (
	options: IContainerLintToolOptions,
): readonly IToolRegistration[] => {
	const prefix = options.namespacePrefix;
	const probeDeps = options.probeDeps ?? realProbeDeps();
	const runExec = options.runExec;
	return [
		{
			id: 'container_lint',
			tags: ['container', 'lint', 'read-only'],
			register: async (server) => {
				server.registerTool(
					`${prefix}_container_lint`,
					{
						description:
							'Lint a Dockerfile (hadolint-style). Uses hadolint when available and falls back to the built-in DLxxxx rules otherwise, so the tool never returns an empty report just because hadolint is not installed. Pure: pass the Dockerfile source as `source`.',
						inputSchema: LINT_INPUT,
						outputSchema: LINT_OUTPUT,
					},
					async (args) => {
						const result = await runDockerfileLint({
							source: args.source,
							probeDeps,
						});
						return toolJson(
							LINT_OUTPUT.parse({
								ok: true as const,
								engine: result.engine,
								hadolintAvailable: result.hadolintAvailable,
								findings: result.findings,
							}),
						);
					},
				);
			},
		},
		{
			id: 'container_logs',
			tags: ['container', 'logs', 'read-only'],
			register: async (server) => {
				server.registerTool(
					`${prefix}_container_logs`,
					{
						description:
							'Tail logs from a running docker container or a kubernetes pod. Read-only. Pass `kind: "docker" | "kubectl"`, the container/pod name as `target`, optional `tail` (default 100), and optional `namespace` (kubectl). Missing CLI → install hint.',
						inputSchema: LOGS_INPUT,
						outputSchema: LOGS_ALL,
					},
					async (args) => {
						const tool =
							args.kind === 'docker' ? DOCKER_TOOL : KUBECTL_TOOL;
						const probe = await probeTool(tool, probeDeps);
						if (!probe.available) {
							return toolJson(
								LOGS_SKIPPED.parse({
									ok: false as const,
									kind: 'skipped' as const,
									hint: probe.installHint?.command ?? '',
								}),
							);
						}
						const tail = args.tail ?? 100;
						const argv =
							args.kind === 'docker'
								? ['logs', '--tail', String(tail), args.target]
								: [
										'logs',
										'--tail',
										String(tail),
										...(args.namespace !== undefined
											? ['-n', args.namespace]
											: []),
										args.target,
									];
						const run = await runExternalTool(
							{ tool, args: argv, timeoutMs: 30_000 },
							runExec,
						);
						if (run.unavailable || !run.ok) {
							throw new Error(
								`${tool.bin} logs failed (exit ${run.code}): ${run.stderr.slice(0, 256)}`,
							);
						}
						return toolJson(
							LOGS_OUTPUT.parse({
								ok: true as const,
								kind: args.kind,
								target: args.target,
								logs: run.stdout,
							}),
						);
					},
				);
			},
		},
	];
};

export { HADO_LINT_TOOL };
