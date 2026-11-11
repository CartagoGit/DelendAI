/** Bytes in a kibibyte, the step between compose memory units. */
export const BYTES_PER_KIBIBYTE = 1024;

/** Bytes in each unit a compose memory limit can be written in. */
export const MEMORY_UNIT_BYTES: Readonly<Record<string, number>> = {
	'': 1,
	b: 1,
	k: BYTES_PER_KIBIBYTE,
	m: BYTES_PER_KIBIBYTE ** 2,
	g: BYTES_PER_KIBIBYTE ** 3,
};

/** `512m`, `1g`, `1.5gb`, `2048`. */
export const MEMORY_LIMIT_PATTERN = /^(\d+(?:\.\d+)?)\s*([kmg]?)b?$/i;

/** Runs a command through a login shell, passing each argument through untouched. */
export const COMPOSE_SHELL_SCRIPT = 'exec "$@"';

/** Shell used for commands inside a compose service. */
export const COMPOSE_SHELL = 'bash';
