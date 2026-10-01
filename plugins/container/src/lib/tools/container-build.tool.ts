/**
 * container-build.tool.ts — f00133 S3: `container_build` + `k8s_apply`.
 *
 * Mutating actions gated behind an explicit `confirm: true` payload
 * (same posture as the database plugin's `db_query` write gate). The
 * default — no `confirm` flag — refuses the call before the CLI is
 * even probed so the user can preview the action without writing.
 *
 * Read-only tools (`container_inspect`, `container_lint`,
 * `container_logs`) stay in their own files. This file is the only
 * mutation surface in the container plugin.
 */
import z from 'zod';

import type { IToolRegistration } from '@delendai/core/public';
import {
	probeTool,
	realProbeDeps,
	runExternalTool,
	toolJson,
} from '@delendai/core/public';

import type { IArgvExec, IProbeDeps } from '@delendai/core/public';
import { DOCKER_TOOL, KUBECTL_TOOL } from '../inspect/cli-tools';

export interface IContainerBuildToolOptions {
	readonly namespacePrefix: string;
	readonly probeDeps?: IProbeDeps;
	readonly runExec?: IArgvExec;
}

const REQUIRE_CONFIRM: { ok: false; reason: string; nextAction: string } = {
	ok: false,
	reason: 'mutation requires confirm: true',
	nextAction:
		'Pass `confirm: true` (or `dryRun: true`) to acknowledge the mutation before retrying.',
};

const BUILD_INPUT = z
	.object({
		tag: z.string().min(1).max(256),
		dockerfile: z.string().min(1).max(2_048).optional(),
		context: z.string().min(1).max(2_048).optional(),
		confirm: z.boolean().optional(),
		dryRun: z.boolean().optional(),
	})
	.strict();

const APPLY_INPUT = z
	.object({
		manifest: z
			.string()
			.min(1)
			.max(64 * 1024),
		namespace: z.string().optional(),
		confirm: z.boolean().optional(),
		dryRun: z.boolean().optional(),
	})
	.strict();

const BUILD_OK = z.object({
	ok: z.literal(true),
	command: z.string(),
	exitCode: z.number(),
	imageId: z.string().optional(),
});
const APPLY_OK = z.object({
	ok: z.literal(true),
	command: z.string(),
	exitCode: z.number(),
});

const REFUSAL = z.object({
	ok: z.literal(false),
	reason: z.string(),
	nextAction: z.string(),
});

const DRY_RUN = z.object({
	ok: z.literal('dry-run'),
	command: z.string(),
});

const INSTALL_MISSING = z.object({
	ok: z.literal(false),
	isError: z.literal(true),
	error: z.object({
		reason: z.literal('install-missing'),
		nextAction: z.string().optional(),
	}),
});

const BUILD_OUTPUT = z.union([BUILD_OK, REFUSAL, DRY_RUN, INSTALL_MISSING]);
const APPLY_OUTPUT = z.union([APPLY_OK, REFUSAL, DRY_RUN, INSTALL_MISSING]);

/** Parse `docker build` output to extract the final image id. */
const extractImageId = (stdout: string): string | undefined => {
	for (const line of stdout.split('\n')) {
		const match = /sha256:[a-f0-9]+/.exec(line);
		if (match !== null) return match[0];
	}
	return undefined;
};

export const buildContainerBuildToolRegistrations = (
	options: IContainerBuildToolOptions,
): readonly IToolRegistration[] => {
	const prefix = options.namespacePrefix;
	const probeDeps = options.probeDeps ?? realProbeDeps();
	const runExec = options.runExec;

	const buildDockerfileArg = (path: string | undefined): readonly string[] =>
		path === undefined ? [] : ['-f', path];

	const installMissing = (nextAction?: string) =>
		toolJson(
			INSTALL_MISSING.parse({
				ok: false,
				isError: true,
				error: {
					reason: 'install-missing',
					...(nextAction !== undefined && nextAction.length > 0
						? { nextAction }
						: {}),
				},
			}),
		);

	return [
		{
			id: 'container_build',
			tags: ['container', 'build', 'mutating'],
			effects: ['spawn'],
			register: async (server) => {
				server.registerTool(
					`${prefix}_container_build`,
					{
						description:
							'Build a docker image. **Mutation**: requires `confirm: true` to actually run. Pass `dryRun: true` to preview the docker argv without executing.',
						inputSchema: BUILD_INPUT,
						outputSchema: BUILD_OUTPUT,
					},
					async (args) => {
						const argv: readonly string[] = [
							'build',
							'-t',
							args.tag,
							...buildDockerfileArg(args.dockerfile),
							args.context ?? '.',
						];
						const command = `docker ${argv.join(' ')}`;
						if (args.dryRun === true) {
							return toolJson(
								DRY_RUN.parse({
									ok: 'dry-run' as const,
									command,
								}),
							);
						}
						if (args.confirm !== true) {
							return toolJson(REFUSAL.parse(REQUIRE_CONFIRM));
						}
						const probe = await probeTool(DOCKER_TOOL, probeDeps);
						if (!probe.available) {
							return installMissing(probe.installHint?.command);
						}
						const run = await runExternalTool(
							{
								tool: DOCKER_TOOL,
								args: argv,
								timeoutMs: 5 * 60_000,
							},
							runExec,
						);
						if (run.unavailable || !run.ok) {
							throw new Error(
								`docker build failed (exit ${run.code}): ${run.stderr.slice(0, 256)}`,
							);
						}
						return toolJson(
							BUILD_OK.parse({
								ok: true as const,
								command,
								exitCode: run.code,
								...(extractImageId(run.stdout) !== undefined
									? { imageId: extractImageId(run.stdout) }
									: {}),
							}),
						);
					},
				);
			},
		},
		{
			id: 'k8s_apply',
			tags: ['container', 'kubernetes', 'mutating'],
			effects: ['spawn'],
			register: async (server) => {
				server.registerTool(
					`${prefix}_k8s_apply`,
					{
						description:
							'Apply a Kubernetes manifest via `kubectl apply -f -`. **Mutation**: requires `confirm: true` to actually run. Pass `dryRun: true` to preview without executing.',
						inputSchema: APPLY_INPUT,
						outputSchema: APPLY_OUTPUT,
					},
					async (args) => {
						const command =
							args.namespace !== undefined
								? `kubectl apply -n ${args.namespace} -f -`
								: 'kubectl apply -f -';
						if (args.dryRun === true) {
							return toolJson(
								DRY_RUN.parse({
									ok: 'dry-run' as const,
									command,
								}),
							);
						}
						if (args.confirm !== true) {
							return toolJson(REFUSAL.parse(REQUIRE_CONFIRM));
						}
						const probe = await probeTool(KUBECTL_TOOL, probeDeps);
						if (!probe.available) {
							return installMissing(probe.installHint?.command);
						}
						const argv =
							args.namespace !== undefined
								? ['apply', '-n', args.namespace, '-f', '-']
								: ['apply', '-f', '-'];
						const run = await runExternalTool(
							{
								tool: KUBECTL_TOOL,
								args: argv,
								timeoutMs: 60_000,
								redact: [/data\.kubernetes\.io\/[^"\s]+/g],
								stdin: args.manifest,
							},
							runExec,
						);
						if (run.unavailable || !run.ok) {
							throw new Error(
								`kubectl apply failed (exit ${run.code}): ${run.stderr.slice(0, 256)}`,
							);
						}
						return toolJson(
							APPLY_OK.parse({
								ok: true as const,
								command,
								exitCode: run.code,
							}),
						);
					},
				);
			},
		},
	];
};
