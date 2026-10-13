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
