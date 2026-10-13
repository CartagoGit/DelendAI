import {
	DOCKER_BINARY,
	DOCKER_DEFAULT_NETWORK,
	DOCKER_DEFAULT_USER,
	DOCKER_IDLE_COMMAND,
	DOCKER_SOCKET_HOST_PATH,
} from '../contracts/constants/docker-cli.constant';
import type {
	IDockerCliOptions,
	IDockerMount,
} from '../contracts/interfaces/docker-cli-execution.interface';
import type { IExecOptions } from '../contracts/interfaces/execution-env-types.interface';

/** A `--mount` value is comma separated, so these cannot appear in it. */
const UNSAFE_MOUNT_CHARACTERS = /[,"\n\r]/;

/** Refuse a mount that cannot be expressed safely or hands over the host. */
export const assertMountsAllowed = (
	mounts: readonly IDockerMount[],
	allowDockerSocket: boolean,
): void => {
	for (const mount of mounts) {
		if (
			UNSAFE_MOUNT_CHARACTERS.test(mount.hostPath) ||
			UNSAFE_MOUNT_CHARACTERS.test(mount.containerPath)
		) {
			throw new Error(
				`mount path may not contain commas, quotes or newlines: ${mount.hostPath}`,
			);
		}
		if (mount.hostPath === DOCKER_SOCKET_HOST_PATH && !allowDockerSocket) {
			throw new Error(
				'mounting the docker socket needs allowDockerSocket to be set explicitly',
			);
		}
	}
};

const mountArgument = (mount: IDockerMount): string => {
	const base = `--mount=type=bind,source=${mount.hostPath},target=${mount.containerPath}`;
	return mount.readOnly === false ? base : `${base},readonly`;
};

/**
 * The argument vector that starts the long-lived container commands
 * later exec into. Every option uses the `--flag=value` form so a value
 * that begins with a dash cannot be read as another option, and `--`
 * ends the options before the image.
 */
export const buildRunArguments = (
	options: IDockerCliOptions,
	containerName: string,
): readonly string[] => {
	const cleanup = options.cleanupOnExit ?? 'always';
	return [
		DOCKER_BINARY,
		'run',
		'--detach',
		`--name=${containerName}`,
		`--network=${options.network ?? DOCKER_DEFAULT_NETWORK}`,
		`--user=${options.user ?? DOCKER_DEFAULT_USER}`,
		...(cleanup === 'always' ? ['--rm'] : []),
		...(options.workdir === undefined
			? []
			: [`--workdir=${options.workdir}`]),
		...(options.mounts ?? []).map(mountArgument),
		...Object.entries(options.env ?? {}).map(
			([name, value]) => `--env=${name}=${value}`,
		),
		'--',
		options.image,
		...DOCKER_IDLE_COMMAND,
	];
};

/** Run `command` inside the named container; the command follows `--`. */
export const buildExecArguments = (
	containerName: string,
	command: readonly string[],
	options: IExecOptions,
	user?: string,
): readonly string[] => [
	DOCKER_BINARY,
	'exec',
	...(options.stdin === undefined ? [] : ['--interactive']),
	...(user === undefined ? [] : [`--user=${user}`]),
	...(options.cwd === undefined ? [] : [`--workdir=${options.cwd}`]),
	...Object.entries(options.env ?? {}).map(
		([name, value]) => `--env=${name}=${value}`,
	),
	'--',
	containerName,
	...command,
];
