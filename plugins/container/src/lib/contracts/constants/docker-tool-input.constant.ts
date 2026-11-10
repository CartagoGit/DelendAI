/**
 * docker-tool-input.constant.ts — what the docker tools accept, and the
 * shape of what they answer.
 */
import z from 'zod';

import {
	DOCKER_ARGUMENTS_MAX,
	DOCKER_ARGUMENT_MAX,
	DOCKER_LOG_TAIL_MAX,
	DOCKER_MOUNTS_MAX,
	DOCKER_NAMESPACE_MAX,
	DOCKER_NAME_MAX,
	DOCKER_PATH_MAX,
	DOCKER_PORTS_MAX,
} from './docker-signals.constant';

const NAME = z
	.string()
	.min(1)
	.max(DOCKER_NAME_MAX)
	.regex(/^[\w./:@-]+$/u);
const CONSENT = {
	confirm: z.boolean().optional(),
	confirmRisk: z.boolean().optional(),
	dryRun: z.boolean().optional(),
};
export const RESULT = z.looseObject({
	ok: z.union([z.boolean(), z.literal('dry-run')]),
});
export const COMPOSE_FILES = [
	'compose.yaml',
	'compose.yml',
	'docker-compose.yaml',
	'docker-compose.yml',
];

export const PULL_INPUT = z
	.object({
		image: NAME,
		policy: z.enum(['always', 'if-not-present']).optional(),
		...CONSENT,
	})
	.strict();
export const RUN_INPUT = z
	.object({
		image: NAME,
		command: z
			.array(z.string().max(DOCKER_ARGUMENT_MAX))
			.max(DOCKER_ARGUMENTS_MAX)
			.optional(),
		name: NAME.optional(),
		env: z
			.record(
				z.string().regex(/^[A-Za-z_][A-Za-z0-9_]*$/u),
				z.string().max(DOCKER_ARGUMENT_MAX),
			)
			.optional(),
		ports: z
			.array(z.string().regex(/^[\d.:]+(?:\/(?:tcp|udp))?$/u))
			.max(DOCKER_PORTS_MAX)
			.optional(),
		mounts: z
			.array(z.string().min(1).max(DOCKER_PATH_MAX))
			.max(DOCKER_MOUNTS_MAX)
			.optional(),
		network: z.string().max(DOCKER_NAME_MAX).optional(),
		privileged: z.boolean().optional(),
		pid: z.string().max(DOCKER_NAMESPACE_MAX).optional(),
		ipc: z.string().max(DOCKER_NAMESPACE_MAX).optional(),
		detach: z.boolean().optional(),
		...CONSENT,
	})
	.strict();
export const EXEC_INPUT = z
	.object({
		container: NAME,
		command: z
			.array(z.string().max(DOCKER_ARGUMENT_MAX))
			.min(1)
			.max(DOCKER_ARGUMENTS_MAX),
		...CONSENT,
	})
	.strict();
export const COMPOSE_INPUT = z
	.object({
		action: z.enum(['services', 'ps', 'logs', 'up', 'down', 'exec']),
		service: NAME.optional(),
		all: z.boolean().optional(),
		command: z
			.array(z.string().max(DOCKER_ARGUMENT_MAX))
			.max(DOCKER_ARGUMENTS_MAX)
			.optional(),
		tail: z.number().int().positive().max(DOCKER_LOG_TAIL_MAX).optional(),
		...CONSENT,
	})
	.strict();
export const RESOURCE_INPUT = z
	.object({
		action: z.enum(['ls', 'inspect', 'create', 'rm']),
		name: NAME.optional(),
		...CONSENT,
	})
	.strict();
