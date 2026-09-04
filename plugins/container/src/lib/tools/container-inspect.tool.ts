import z from 'zod';

import type { IToolRegistration } from '@delendai/core/public';
import { toolError, toolJson } from '@delendai/core/public';

import { realContainerInspectDeps } from '../inspect/real-container-deps';
import { runInspect } from '../inspect/run-inspect';
import type {
	IContainerInspectDeps,
	IContainerInspectInput,
} from '../inspect/types';

export interface IContainerInspectToolOptions {
	readonly namespacePrefix: string;
	readonly deps?: IContainerInspectDeps;
}

const INPUT = z
	.object({
		kind: z.enum(['docker-ps', 'docker-images', 'k8s-get']),
		namespace: z.string().optional(),
	})
	.strict();

const DockerContainerSchema = z.object({
	id: z.string(),
	name: z.string(),
	image: z.string(),
	status: z.string(),
	ports: z.array(z.string()),
	createdAt: z.string(),
});

const DockerImageSchema = z.object({
	id: z.string(),
	repository: z.string(),
	tag: z.string(),
	size: z.string(),
	createdAt: z.string(),
});

const K8sPodSummarySchema = z.object({
	name: z.string(),
	namespace: z.string(),
	status: z.string(),
	nodeName: z.string().optional(),
	podIp: z.string().optional(),
	containers: z.array(z.string()),
});

const OUTPUT = z.union([
	z.object({
		ok: z.literal(true),
		kind: z.literal('docker-ps'),
		items: z.array(DockerContainerSchema),
	}),
	z.object({
		ok: z.literal(true),
		kind: z.literal('docker-images'),
		items: z.array(DockerImageSchema),
	}),
	z.object({
		ok: z.literal(true),
		kind: z.literal('k8s-get'),
		items: z.array(K8sPodSummarySchema),
	}),
	z.object({
		ok: z.literal('skipped'),
		hint: z.string(),
	}),
]);

const invalidArguments = (issues: readonly z.ZodIssue[]) =>
	toolError(
		'invalid-arguments',
		issues
			.map((issue) => `${issue.path.join('.')}: ${issue.message}`)
			.join('; '),
	);

const normalizeInput = (
	input: z.infer<typeof INPUT>,
): IContainerInspectInput =>
	input.namespace === undefined
		? { kind: input.kind }
		: { kind: input.kind, namespace: input.namespace };

export const buildContainerInspectToolRegistrations = (
	options: IContainerInspectToolOptions,
): readonly IToolRegistration[] => {
	const deps = options.deps ?? realContainerInspectDeps;
	return [
		{
			id: 'container_inspect',
			tags: ['container', 'docker', 'kubernetes', 'read-only'],
			effects: ['network'],
			summary:
				'Inspect local Docker containers/images or Kubernetes pods through the host CLI. Read-only.',
			register: async (server) => {
				server.registerTool(
					`${options.namespacePrefix}_container_inspect`,
					{
						description:
							'Read-only container inspection over docker/kubectl. Supports docker-ps, docker-images, and k8s-get; missing CLIs return a skipped envelope with an install hint.',
						inputSchema: INPUT,
						outputSchema: OUTPUT,
					},
					async (args) => {
						const parsed = INPUT.safeParse(args);
						if (!parsed.success) {
							return invalidArguments(parsed.error.issues);
						}

						try {
							const result = await runInspect(
								normalizeInput(parsed.data),
								deps,
							);
							if (result.kind === 'skipped') {
								return toolJson({
									ok: 'skipped' as const,
									hint: result.hint,
								});
							}
							return toolJson({
								ok: true as const,
								kind: result.kind,
								items: result.items,
							});
						} catch (error) {
							return toolError(
								'container-inspect-failed',
								(error as Error).message,
							);
						}
					},
				);
			},
		},
	];
};
