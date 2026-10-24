/**
 * container-docker.tool.ts — the docker tools that pull, run and exec,
 * drive compose, and manage networks and volumes.
 *
 * Six tools, each a thin argv over `runDocker`, so the consent rules
 * live in one place: what changes something needs `confirm`, what hands
 * a container the host also needs `confirmRisk`, and reading needs
 * nothing. Registered only in a repository that uses Docker.
 */
import type z from 'zod';

import type { IToolRegistration } from '@delendai/core/contracts';
import { SafeWorkspaceReader, toolJson } from '@delendai/core/public';

import { parseCompose } from '../compose/compose-parser.service';
import { DOCKER_LOG_TAIL_DEFAULT } from '../contracts/constants/docker-signals.constant';
import {
	RESULT,
	COMPOSE_FILES,
	PULL_INPUT,
	RUN_INPUT,
	EXEC_INPUT,
	COMPOSE_INPUT,
	RESOURCE_INPUT,
} from '../contracts/constants/docker-tool-input.constant';
import type { IDockerDeps } from '../contracts/interfaces/docker-command.interface';
import { callerCheckout } from '@delendai/core/public';

import { runDocker } from '../run/docker-command.service';
import { containerRisks } from '../run/docker-risk.helper';

const refuse = (reason: string, nextAction: string) =>
	toolJson({ ok: false, reason, nextAction });

export const buildContainerDockerToolRegistrations = (options: {
	readonly namespacePrefix: string;
	readonly workspaceRootAbs: string;
	readonly deps?: IDockerDeps;
}): readonly IToolRegistration[] => {
	const prefix = options.namespacePrefix;
	// The caller's checkout when the call is bound to one (an agent's
	// unit), read per call: the server's own root is the fallback only for a
	// call bound to no checkout.
	const deps = (): IDockerDeps => ({
		cwd: callerCheckout.executionRootOr(options.workspaceRootAbs),
		...options.deps,
	});
	const tool = <TSchema extends z.ZodType>(
		id: string,
		description: string,
		inputSchema: TSchema,
		handler: (
			args: z.infer<TSchema>,
		) => Promise<ReturnType<typeof toolJson>>,
	): IToolRegistration => ({
		id,
		tags: ['container', 'docker'],
		effects: ['spawn'],
		register: async (server) => {
			server.registerTool(
				`${prefix}_${id}`,
				{ description, inputSchema, outputSchema: RESULT },
				// The schema is generic here, so the SDK cannot derive the
				// callback's argument type from it; the handler is typed by the
				// same schema at each call site.
				handler as Parameters<typeof server.registerTool>[2],
			);
		},
	});
	const composeFile = async (): Promise<
		{ path: string; text: string } | undefined
	> => {
		const reader = new SafeWorkspaceReader(
			callerCheckout.executionRootOr(options.workspaceRootAbs),
		);
		for (const path of COMPOSE_FILES) {
			const text = await reader
				.readText(path)
				.then((read) => read.content)
				.catch(() => undefined);
			if (text !== undefined) return { path, text };
		}
		return undefined;
	};
	return [
		tool(
			'container_pull',
			'Pull a docker image. **Mutation**: needs `confirm: true`; `dryRun: true` shows the command. `policy: "if-not-present"` (the default) pulls only when the image is missing locally.',
			PULL_INPUT,
			async (args) => {
				if (
					(args.policy ?? 'if-not-present') === 'if-not-present' &&
					args.dryRun !== true
				) {
					const present = await runDocker(deps(), {
						argv: [
							'image',
							'inspect',
							'--format',
							'{{.Id}}',
							args.image,
						],
						mutating: false,
						risks: [],
					});
					if (present.ok === true)
						return toolJson({
							ok: true,
							command: `docker image inspect ${args.image}`,
							skipped: 'present',
						});
				}
				return toolJson(
					await runDocker(
						deps(),
						{
							argv: ['pull', args.image],
							mutating: true,
							risks: [],
						},
						args,
					),
				);
			},
		),
		tool(
			'container_run',
			'Run a container. **Mutation**: needs `confirm: true`. A privileged container, a docker socket mount, or the host network/pid/ipc namespace also needs `confirmRisk: true`, which `confirm` never implies. `--rm` unless `name` is given.',
			RUN_INPUT,
			async (args) => {
				const risks = containerRisks(args);
				const argv = [
					'run',
					...(args.name === undefined
						? ['--rm']
						: ['--name', args.name]),
					...(args.detach === true ? ['-d'] : []),
					...(args.privileged === true ? ['--privileged'] : []),
					...(args.network === undefined
						? []
						: ['--network', args.network]),
					...(args.pid === undefined ? [] : ['--pid', args.pid]),
					...(args.ipc === undefined ? [] : ['--ipc', args.ipc]),
					...Object.entries(args.env ?? {}).flatMap(
						([key, value]) => ['-e', `${key}=${value}`],
					),
					...(args.ports ?? []).flatMap((port) => ['-p', port]),
					...(args.mounts ?? []).flatMap((mount) => ['-v', mount]),
					args.image,
					...(args.command ?? []),
				];
				return toolJson(
					await runDocker(
						deps(),
						{ argv, mutating: true, risks },
						args,
					),
				);
			},
		),
		tool(
			'container_exec',
			'Run a command inside a running container. **Mutation**: needs `confirm: true`; `dryRun: true` shows the command.',
			EXEC_INPUT,
			async (args) =>
				toolJson(
					await runDocker(
						deps(),
						{
							argv: ['exec', args.container, ...args.command],
							mutating: true,
							risks: [],
						},
						args,
					),
				),
		),
		tool(
			'container_compose',
			"Drive the project's compose file. `services` lists its services (ports, env NAMES, mounts) without docker; `ps` and `logs` read; `up`, `down` and `exec` need `confirm: true`. `up` starts one `service` unless `all: true`; a service that is privileged or mounts the docker socket also needs `confirmRisk: true`.",
			COMPOSE_INPUT,
			async (args) => {
				const file = await composeFile();
				if (file === undefined)
					return refuse(
						'no compose file at the workspace root',
						`Add one of ${COMPOSE_FILES.join(', ')}, or use container_run.`,
					);
				const services = parseCompose(file.text);
				if (args.action === 'services')
					return toolJson({
						ok: true,
						file: file.path,
						services: [...services],
					});
				const base = ['compose', '-f', file.path];
				if (args.action === 'ps')
					return toolJson(
						await runDocker(deps(), {
							argv: [...base, 'ps', '--format', 'json'],
							mutating: false,
							risks: [],
						}),
					);
				if (args.action === 'logs')
					return toolJson(
						await runDocker(deps(), {
							argv: [
								...base,
								'logs',
								'--no-color',
								'--tail',
								String(args.tail ?? DOCKER_LOG_TAIL_DEFAULT),
								...(args.service === undefined
									? []
									: [args.service]),
							],
							mutating: false,
							risks: [],
						}),
					);
				if (args.action === 'down')
					return toolJson(
						await runDocker(
							deps(),
							{
								argv: [...base, 'down'],
								mutating: true,
								risks: [],
							},
							args,
						),
					);
				if (
					args.service === undefined &&
					!(args.action === 'up' && args.all === true)
				)
					return refuse(
						`${args.action} names one service`,
						`Pass \`service\` (one of ${services.map((service) => service.name).join(', ') || 'none declared'})${args.action === 'up' ? ', or `all: true` for the whole stack' : ''}.`,
					);
				if (
					args.service !== undefined &&
					!services.some((service) => service.name === args.service)
				)
					return refuse(
						`no service "${args.service}" in ${file.path}`,
						`Pick one of ${services.map((service) => service.name).join(', ')}.`,
					);
				if (args.action === 'exec')
					return toolJson(
						await runDocker(
							deps(),
							{
								argv: [
									...base,
									'exec',
									'-T',
									String(args.service),
									...(args.command ?? ['sh']),
								],
								mutating: true,
								risks: [],
							},
							args,
						),
					);
				const started =
					args.service === undefined
						? services
						: services.filter(
								(service) => service.name === args.service,
							);
				const risks = started.flatMap((service) =>
					containerRisks({ mounts: service.mounts }).map(
						(risk) => `${service.name} ${risk}`,
					),
				);
				return toolJson(
					await runDocker(
						deps(),
						{
							argv: [
								...base,
								'up',
								'-d',
								...(args.service === undefined
									? []
									: [args.service]),
							],
							mutating: true,
							risks,
						},
						args,
					),
				);
			},
		),
		...(['network', 'volume'] as const).map((kind) =>
			tool(
				`container_${kind}`,
				`List, inspect, create or remove a docker ${kind}. \`create\` and \`rm\` need \`confirm: true\`; \`ls\` and \`inspect\` read.`,
				RESOURCE_INPUT,
				async (args) => {
					if (args.action !== 'ls' && args.name === undefined)
						return refuse(
							`${args.action} names one ${kind}`,
							'Pass `name`.',
						);
					const argv =
						args.action === 'ls'
							? [kind, 'ls', '--format', 'json']
							: [kind, args.action, String(args.name)];
					return toolJson(
						await runDocker(
							deps(),
							{
								argv,
								mutating:
									args.action === 'create' ||
									args.action === 'rm',
								risks: [],
							},
							args,
						),
					);
				},
			),
		),
	];
};
