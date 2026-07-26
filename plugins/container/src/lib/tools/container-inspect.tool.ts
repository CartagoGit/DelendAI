import { z } from 'zod';

import type {
	IArgvExec,
	IToolRegistration,
} from '@mcp-vertex/core/public';
import {
	probeTool,
	realProbeDeps,
	runExternalTool,
	toolJson,
} from '@mcp-vertex/core/public';

import {
	CONTAINER_TOOLS,
	DOCKER_TOOL,
	KUBECTL_TOOL,
	parseDockerImages,
	parseDockerPs,
	parseKubectlGet,
	type IContainerImageRow,
	type IContainerRow,
	type IK8sRow,
} from '../inspect';

export interface IContainerInspectToolOptions {
	readonly namespacePrefix: string;
	readonly probe?: (tool: {
		readonly id: string;
		readonly bin: string;
	}) => Promise<{
		readonly available: boolean;
		readonly installHint?: string;
	}>;
	readonly exec?: IArgvExec;
}

const PS_INPUT = z.object({ all: z.boolean().optional() }).strict();
const IMAGES_INPUT = z.object({ all: z.boolean().optional() }).strict();
const K8S_GET_INPUT = z
	.object({
		kind: z.string().min(1).max(63),
		name: z.string().min(1).max(253).optional(),
		namespace: z.string().optional(),
	})
	.strict();

const CONTAINER_ROW = z.object({
	id: z.string(),
	name: z.string(),
	image: z.string(),
	state: z.string(),
	status: z.string(),
	ports: z.string(),
	createdAt: z.string(),
});

const IMAGE_ROW = z.object({
	id: z.string(),
	repository: z.string(),
	tag: z.string(),
	size: z.string(),
	createdAt: z.string(),
});

const K8S_ROW = z.object({
	kind: z.string(),
	apiVersion: z.string(),
	name: z.string(),
	namespace: z.string(),
	uid: z.string(),
	createdAt: z.string(),
	phase: z.string(),
	podIp: z.string(),
	hostIp: z.string(),
});

const INSTALL_MISSING_ERROR = z.object({
	ok: z.literal(false),
	error: z.object({
		reason: z.literal('install-missing'),
		installHint: z.string().optional(),
	}),
});

const PARSE_ERROR = z.object({
	ok: z.literal(false),
	error: z.object({
		reason: z.literal('parse-error'),
		detail: z.string(),
	}),
});

const COMMAND_FAILED = z.object({
	ok: z.literal(false),
	error: z.object({
		reason: z.literal('command-failed'),
		detail: z.string(),
	}),
});

const PS_SUCCESS = z.object({
	ok: z.literal(true),
	rows: z.array(CONTAINER_ROW),
	skipped: z.number().int().nonnegative(),
});

const IMAGES_SUCCESS = z.object({
	ok: z.literal(true),
	rows: z.array(IMAGE_ROW),
	skipped: z.number().int().nonnegative(),
});

const K8S_GET_SUCCESS = z.object({
	ok: z.literal(true),
	rows: z.array(K8S_ROW),
	skipped: z.number().int().nonnegative(),
	resourceKind: z.string(),
	resourceApiVersion: z.string(),
});

const PS_OUTPUT = z.union([
	PS_SUCCESS,
	INSTALL_MISSING_ERROR,
	PARSE_ERROR,
	COMMAND_FAILED,
]);
const IMAGES_OUTPUT = z.union([
	IMAGES_SUCCESS,
	INSTALL_MISSING_ERROR,
	PARSE_ERROR,
	COMMAND_FAILED,
]);
const K8S_GET_OUTPUT = z.union([
	K8S_GET_SUCCESS,
	INSTALL_MISSING_ERROR,
	PARSE_ERROR,
	COMMAND_FAILED,
]);

const defaultProbe = async (tool: {
	id: string;
	bin: string;
}): Promise<{ available: boolean; installHint?: string }> => {
	const result = await probeTool(tool, realProbeDeps());
	return {
		available: result.available,
		...(result.installHint?.command !== undefined
			? { installHint: result.installHint.command }
			: {}),
	};
};

const buildDockerArgs = (
	args: { readonly all?: boolean | undefined },
	base: readonly string[],
): readonly string[] => [...base, ...(args.all === true ? ['--all'] : [])];

const installMissing = (installHint?: string) =>
	toolJson(
		INSTALL_MISSING_ERROR.parse({
			ok: false,
			error: {
				reason: 'install-missing',
				...(installHint !== undefined ? { installHint } : {}),
			},
		}),
	);

const parseError = (detail: string) =>
	toolJson(
		PARSE_ERROR.parse({
			ok: false,
			error: { reason: 'parse-error', detail },
		}),
	);

const commandFailed = (detail: string) =>
	toolJson(
		COMMAND_FAILED.parse({
			ok: false,
			error: { reason: 'command-failed', detail },
		}),
	);

const parseFailure = (
	stdout: string,
	skipped: number,
	rowCount: number,
): boolean => stdout.trim().length > 0 && rowCount === 0 && skipped > 0;

type TCommandOutcome<T> =
	| { readonly kind: 'ok'; readonly rows: readonly T[]; readonly skipped: number }
	| { readonly kind: 'install-missing'; readonly installHint?: string }
	| { readonly kind: 'parse-error'; readonly detail: string }
	| { readonly kind: 'command-failed'; readonly detail: string };

type TK8sOutcome =
	| {
			readonly kind: 'ok';
			readonly rows: readonly IK8sRow[];
			readonly skipped: number;
			readonly resourceKind: string;
			readonly resourceApiVersion: string;
	  }
	| { readonly kind: 'install-missing'; readonly installHint?: string }
	| { readonly kind: 'parse-error'; readonly detail: string }
	| { readonly kind: 'command-failed'; readonly detail: string };

const runContainerPs = async (
	options: IContainerInspectToolOptions,
	input: { readonly all?: boolean | undefined },
): Promise<TCommandOutcome<IContainerRow>> => {
	const probe = await (options.probe ?? defaultProbe)(DOCKER_TOOL);
	if (!probe.available) {
		return {
			kind: 'install-missing',
			...(probe.installHint !== undefined
				? { installHint: probe.installHint }
				: {}),
		};
	}
	const run = await runExternalTool(
		{
			tool: DOCKER_TOOL,
			args: buildDockerArgs(input, ['ps', '--format', '{{json .}}']),
			timeoutMs: 30_000,
		},
		options.exec,
	);
	if (run.unavailable || !run.ok) {
		return {
			kind: 'command-failed',
			detail: `docker ps failed (exit ${run.code}): ${run.stderr.slice(0, 256)}`,
		};
	}
	const parsed = parseDockerPs(run.stdout.split('\n'));
	if (parseFailure(run.stdout, parsed.skipped, parsed.rows.length)) {
		return {
			kind: 'parse-error',
			detail: 'docker ps returned malformed JSON lines',
		};
	}
	return { kind: 'ok', ...parsed };
};

const runContainerImages = async (
	options: IContainerInspectToolOptions,
	input: { readonly all?: boolean | undefined },
): Promise<TCommandOutcome<IContainerImageRow>> => {
	const probe = await (options.probe ?? defaultProbe)(DOCKER_TOOL);
	if (!probe.available) {
		return {
			kind: 'install-missing',
			...(probe.installHint !== undefined
				? { installHint: probe.installHint }
				: {}),
		};
	}
	const run = await runExternalTool(
		{
			tool: DOCKER_TOOL,
			args: buildDockerArgs(input, ['images', '--format', '{{json .}}']),
			timeoutMs: 30_000,
		},
		options.exec,
	);
	if (run.unavailable || !run.ok) {
		return {
			kind: 'command-failed',
			detail: `docker images failed (exit ${run.code}): ${run.stderr.slice(0, 256)}`,
		};
	}
	const parsed = parseDockerImages(run.stdout.split('\n'));
	if (parseFailure(run.stdout, parsed.skipped, parsed.rows.length)) {
		return {
			kind: 'parse-error',
			detail: 'docker images returned malformed JSON lines',
		};
	}
	return { kind: 'ok', ...parsed };
};

const runK8sGet = async (
	options: IContainerInspectToolOptions,
	input: {
		readonly kind: string;
		readonly name?: string | undefined;
		readonly namespace?: string | undefined;
	},
): Promise<TK8sOutcome> => {
	const probe = await (options.probe ?? defaultProbe)(KUBECTL_TOOL);
	if (!probe.available) {
		return {
			kind: 'install-missing',
			...(probe.installHint !== undefined
				? { installHint: probe.installHint }
				: {}),
		};
	}
	const args = ['get', input.kind];
	if (input.name !== undefined) args.push(input.name);
	if (input.namespace !== undefined) args.push('-n', input.namespace);
	args.push('-o', 'json');
	const run = await runExternalTool(
		{ tool: KUBECTL_TOOL, args, timeoutMs: 30_000 },
		options.exec,
	);
	if (run.unavailable || !run.ok) {
		return {
			kind: 'command-failed',
			detail: `kubectl get failed (exit ${run.code}): ${run.stderr.slice(0, 256)}`,
		};
	}
	const parsed = parseKubectlGet(run.stdout);
	if (parsed.parseError !== undefined) {
		return { kind: 'parse-error', detail: parsed.parseError };
	}
	return {
		kind: 'ok',
		rows: parsed.rows,
		skipped: parsed.skipped,
		resourceKind: parsed.kind,
		resourceApiVersion: parsed.apiVersion,
	};
};

export const buildContainerInspectToolRegistrations = (
	options: IContainerInspectToolOptions,
): readonly IToolRegistration[] => {
	const prefix = options.namespacePrefix;
	return [
		{
			id: 'container_ps',
			tags: ['container', 'inspect', 'read-only'],
			summary: 'List running containers from the host Docker CLI.',
			register: async (server) => {
				server.registerTool(
					`${prefix}_container_ps`,
					{
						description:
							'List running docker containers on the host. Read-only; missing docker returns a structured install-missing envelope instead of crashing.',
						inputSchema: PS_INPUT,
						outputSchema: PS_OUTPUT,
					},
					async (args) => {
						const result = await runContainerPs(options, args);
						switch (result.kind) {
							case 'install-missing':
								return installMissing(result.installHint);
							case 'parse-error':
								return parseError(result.detail);
							case 'command-failed':
								return commandFailed(result.detail);
							case 'ok':
								return toolJson(
									PS_SUCCESS.parse({ ok: true, ...result }),
								);
						}
					},
				);
			},
		},
		{
			id: 'container_images',
			tags: ['container', 'inspect', 'read-only'],
			summary: 'List local images from the host Docker CLI.',
			register: async (server) => {
				server.registerTool(
					`${prefix}_container_images`,
					{
						description:
							'List local docker images on the host. Read-only; missing docker returns a structured install-missing envelope instead of crashing.',
						inputSchema: IMAGES_INPUT,
						outputSchema: IMAGES_OUTPUT,
					},
					async (args) => {
						const result = await runContainerImages(options, args);
						switch (result.kind) {
							case 'install-missing':
								return installMissing(result.installHint);
							case 'parse-error':
								return parseError(result.detail);
							case 'command-failed':
								return commandFailed(result.detail);
							case 'ok':
								return toolJson(
									IMAGES_SUCCESS.parse({ ok: true, ...result }),
								);
						}
					},
				);
			},
		},
		{
			id: 'k8s_get',
			tags: ['container', 'kubernetes', 'inspect', 'read-only'],
			summary: 'Read Kubernetes resources with kubectl get -o json.',
			register: async (server) => {
				server.registerTool(
					`${prefix}_k8s_get`,
					{
						description:
							'Read Kubernetes resources via kubectl get <kind> <name?> -o json. Read-only; missing kubectl returns a structured install-missing envelope instead of crashing.',
						inputSchema: K8S_GET_INPUT,
						outputSchema: K8S_GET_OUTPUT,
					},
					async (args) => {
						const result = await runK8sGet(options, args);
						switch (result.kind) {
							case 'install-missing':
								return installMissing(result.installHint);
							case 'parse-error':
								return parseError(result.detail);
							case 'command-failed':
								return commandFailed(result.detail);
							case 'ok':
								return toolJson(
									K8S_GET_SUCCESS.parse({ ok: true, ...result }),
								);
						}
					},
				);
			},
		},
	];
};

export { CONTAINER_TOOLS };
