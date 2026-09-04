/**
 * container-lint.tool.ts — f00133 S2: `container_logs` + `container_lint`.
 *
 * `container_lint` runs an offline hadolint-style Dockerfile lint over
 * a workspace-contained Dockerfile path. No binary is required.
 *
 * `container_logs` tails logs from a running docker container. Read-only.
 * Missing CLI returns a structured `ok: 'skipped'` envelope with the
 * install hint.
 */
// effect-boundary-authorized: read-only filesystem path normalization for
// the offline Dockerfile lint; the real I/O goes through the injected
// IDockerfileFetcher and IDockerLogsDeps adapters below.
import { realpath } from 'node:fs/promises';
import { relative, resolve, sep } from 'node:path';

import z from 'zod';

import type { IToolRegistration } from '@delendai/core/public';
import { toolError, toolJson } from '@delendai/core/public';

import { realContainerInspectDeps } from '../inspect/real-container-deps';
import {
	realDockerfileFetcher,
	type IDockerfileFetcher,
} from '../lint/real-dockerfile-fetcher';
import { runLint } from '../lint/run-lint';
import type { IDockerfileFinding } from '../lint/types';
import { runLogs } from '../logs/run-logs';
import type { IDockerLogLine, IDockerLogsDeps } from '../logs/types';

export interface IContainerLogsToolOptions {
	readonly namespacePrefix: string;
	readonly deps?: IDockerLogsDeps;
}

export interface IContainerLintToolOptions {
	readonly namespacePrefix: string;
	readonly workspaceRootAbs: string;
	readonly readDockerfile?: IDockerfileFetcher;
}

const LOGS_INPUT = z
	.object({
		container: z.string().min(1),
		tail: z.number().int().positive().max(10_000).optional(),
		since: z.string().datetime().optional(),
	})
	.strict();

const DockerLogLineSchema = z.object({
	timestamp: z.string(),
	stream: z.enum(['stdout', 'stderr', 'unknown']),
	message: z.string(),
});

const LOGS_OUTPUT = z.union([
	z.object({
		ok: z.literal(true),
		container: z.string(),
		lines: z.array(DockerLogLineSchema),
	}),
	z.object({
		ok: z.literal('skipped'),
		hint: z.string(),
	}),
]);

const LINT_INPUT = z
	.object({
		dockerfilePath: z.string().min(1).optional(),
	})
	.strict();

const DockerfileFindingSchema = z.object({
	ruleId: z.string(),
	severity: z.enum(['critical', 'high', 'medium', 'low', 'info']),
	message: z.string(),
	fix: z.string().optional(),
	location: z.object({
		file: z.string(),
		line: z.number().int().positive(),
	}),
});

const LINT_OUTPUT = z.object({
	ok: z.literal(true),
	findings: z.array(DockerfileFindingSchema),
});

const invalidArguments = (issues: readonly z.ZodIssue[]) =>
	toolError(
		'invalid-arguments',
		issues
			.map((issue) => `${issue.path.join('.')}: ${issue.message}`)
			.join('; '),
	);

const resolveContainedDockerfilePath = async (
	workspaceRootAbs: string,
	dockerfilePath: string | undefined,
): Promise<
	| {
			readonly ok: true;
			readonly abs: string;
			readonly locationFile: string;
	  }
	| {
			readonly ok: false;
			readonly detail: string;
	  }
> => {
	const workspaceRoot = resolve(workspaceRootAbs);
	const requested = dockerfilePath ?? 'Dockerfile';
	const abs = requested.startsWith('/')
		? resolve(requested)
		: resolve(workspaceRoot, requested);
	const rel = relative(workspaceRoot, abs).split(sep).join('/');
	if (rel === '..' || rel.startsWith('../')) {
		return {
			ok: false,
			detail: `Path "${requested}" is outside workspace root`,
		};
	}
	try {
		const [realWorkspaceRoot, realDockerfile] = await Promise.all([
			realpath(workspaceRoot),
			realpath(abs),
		]);
		const realRel = relative(realWorkspaceRoot, realDockerfile)
			.split(sep)
			.join('/');
		if (realRel === '..' || realRel.startsWith('../')) {
			return {
				ok: false,
				detail: `Path "${requested}" resolves outside workspace root`,
			};
		}
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
			return {
				ok: false,
				detail: `Unable to validate Dockerfile path "${requested}"`,
			};
		}
	}
	return {
		ok: true,
		abs,
		locationFile: rel === '' ? 'Dockerfile' : rel,
	};
};

const readDockerfileOrError = async (
	readDockerfile: IDockerfileFetcher,
	path: string,
): Promise<
	{ ok: true; source: string } | { ok: false; code: string; detail: string }
> => {
	try {
		return { ok: true, source: await readDockerfile(path) };
	} catch (error) {
		const failure = error as NodeJS.ErrnoException;
		if (failure.code === 'ENOENT') {
			return {
				ok: false,
				code: 'not-found',
				detail: `Dockerfile not found: ${path}`,
			};
		}
		return {
			ok: false,
			code: 'dockerfile-read-failed',
			detail: failure.message,
		};
	}
};

const logsEnvelope = (container: string, lines: readonly IDockerLogLine[]) =>
	toolJson(
		LOGS_OUTPUT.parse({
			ok: true as const,
			container,
			lines,
		}),
	);

const skippedEnvelope = (hint: string) =>
	toolJson(
		LOGS_OUTPUT.parse({
			ok: 'skipped' as const,
			hint,
		}),
	);

const lintEnvelope = (findings: readonly IDockerfileFinding[]) =>
	toolJson(
		LINT_OUTPUT.parse({
			ok: true as const,
			findings,
		}),
	);

export const buildContainerLogsToolRegistrations = (
	options: IContainerLogsToolOptions,
): readonly IToolRegistration[] => {
	const deps = options.deps ?? realContainerInspectDeps;
	return [
		{
			id: 'container_logs',
			tags: ['container', 'docker', 'logs', 'read-only'],
			effects: ['network'],
			register: async (server) => {
				server.registerTool(
					`${options.namespacePrefix}_container_logs`,
					{
						description:
							'Read-only Docker log tail over the host CLI. Accepts a container name or id, optional `tail`, and optional ISO `since`; missing docker returns a skipped envelope with an install hint.',
						inputSchema: LOGS_INPUT,
						outputSchema: LOGS_OUTPUT,
					},
					async (args) => {
						const parsed = LOGS_INPUT.safeParse(args);
						if (!parsed.success) {
							return invalidArguments(parsed.error.issues);
						}
						const input = {
							container: parsed.data.container,
							...(parsed.data.tail === undefined
								? {}
								: { tail: parsed.data.tail }),
							...(parsed.data.since === undefined
								? {}
								: { since: parsed.data.since }),
						};

						try {
							const result = await runLogs(input, deps);
							if (result.kind === 'skipped') {
								return skippedEnvelope(result.hint);
							}
							return logsEnvelope(result.container, result.lines);
						} catch (error) {
							return toolError(
								'container-logs-failed',
								(error as Error).message,
							);
						}
					},
				);
			},
		},
	];
};

export const buildContainerLintToolRegistrations = (
	options: IContainerLintToolOptions,
): readonly IToolRegistration[] => {
	const readDockerfile = options.readDockerfile ?? realDockerfileFetcher;
	return [
		{
			id: 'container_lint',
			tags: ['container', 'dockerfile', 'lint', 'read-only'],
			register: async (server) => {
				server.registerTool(
					`${options.namespacePrefix}_container_lint`,
					{
						description:
							'Lint a workspace-contained Dockerfile with built-in hadolint-style rules. Reads from disk, works offline, and returns normalized findings.',
						inputSchema: LINT_INPUT,
						outputSchema: LINT_OUTPUT,
					},
					async (args) => {
						const parsed = LINT_INPUT.safeParse(args);
						if (!parsed.success) {
							return invalidArguments(parsed.error.issues);
						}

						const resolved = await resolveContainedDockerfilePath(
							options.workspaceRootAbs,
							parsed.data.dockerfilePath,
						);
						if (!resolved.ok) {
							return toolError(
								'containment-violation',
								resolved.detail,
							);
						}

						const source = await readDockerfileOrError(
							readDockerfile,
							resolved.abs,
						);
						if (!source.ok) {
							return toolError(source.code, source.detail);
						}

						const result = runLint({
							source: source.source,
							file: resolved.locationFile,
						});
						return lintEnvelope(result.findings);
					},
				);
			},
		},
	];
};
