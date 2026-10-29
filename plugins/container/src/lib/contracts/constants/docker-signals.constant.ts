/**
 * docker-signals.constant.ts — the files at a repository's root that say
 * it uses Docker.
 */

/** A root entry named so means the project builds or runs containers. */
export const DOCKER_SIGNALS: readonly string[] = [
	'Dockerfile',
	'docker-compose.yml',
	'docker-compose.yaml',
	'compose.yml',
	'compose.yaml',
	'.devcontainer',
];

/** How long a docker command may run before it is stopped. */
export const DOCKER_COMMAND_TIMEOUT_MS = 5 * 60_000;

/** How much of a command's output a tool returns. */
export const DOCKER_OUTPUT_MAX_CHARS = 8_000;

/** The input limits of the docker tools: long enough for real use, short enough to refuse abuse. */
export const DOCKER_NAME_MAX = 256;
export const DOCKER_ARGUMENT_MAX = 4096;
export const DOCKER_ARGUMENTS_MAX = 64;
export const DOCKER_PATH_MAX = 2048;
export const DOCKER_PORTS_MAX = 32;
export const DOCKER_MOUNTS_MAX = 32;
export const DOCKER_NAMESPACE_MAX = 64;
export const DOCKER_LOG_TAIL_MAX = 10_000;
export const DOCKER_LOG_TAIL_DEFAULT = 200;
