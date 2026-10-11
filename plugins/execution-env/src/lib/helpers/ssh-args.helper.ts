import {
	MAX_TCP_PORT,
	SSH_BINARY,
	SSH_DEFAULT_KEEPALIVE_COUNT_MAX,
	SSH_DEFAULT_KEEPALIVE_INTERVAL_SEC,
	SSH_TARGET_PATTERN,
} from '../contracts/constants/ssh.constant';
import type { ISshExecutionOptions } from '../contracts/interfaces/ssh-execution.interface';
import { quotePosix } from './shell-quoting.helper';

const assertTarget = (label: string, value: string): void => {
	if (!SSH_TARGET_PATTERN.test(value)) {
		throw new Error(`not a valid ssh ${label}: ${value}`);
	}
};

/** `user@host:port` as `-J` expects it. */
const jumpSpec = (
	jump: NonNullable<ISshExecutionOptions['jumpHost']>,
): string =>
	`${jump.user === undefined ? '' : `${jump.user}@`}${jump.host}${jump.port === undefined ? '' : `:${jump.port}`}`;

/** Check every value that reaches the ssh command line. */
export const assertSshOptions = (options: ISshExecutionOptions): void => {
	assertTarget('host', options.host);
	if (options.user !== undefined) assertTarget('user', options.user);
	if (options.jumpHost !== undefined) {
		assertTarget('jump host', options.jumpHost.host);
		if (options.jumpHost.user !== undefined) {
			assertTarget('jump user', options.jumpHost.user);
		}
	}
	for (const port of [options.port, options.jumpHost?.port]) {
		if (
			port !== undefined &&
			(!Number.isInteger(port) || port < 1 || port > MAX_TCP_PORT)
		) {
			throw new Error(`not a valid ssh port: ${port}`);
		}
	}
	if (options.jumpHost !== undefined && options.proxyCommand !== undefined) {
		throw new Error('use either a jump host or a proxy command, not both');
	}
};

/**
 * The ssh argument vector up to and including the host. Each setting is
 * an `-o Key=value` option; `--` ends the options before the host so a
 * hostile host name cannot be read as one.
 */
export const buildSshPrefix = (
	options: ISshExecutionOptions,
): readonly string[] => [
	SSH_BINARY,
	'-o',
	'BatchMode=yes',
	'-o',
	`ServerAliveInterval=${options.keepAliveIntervalSec ?? SSH_DEFAULT_KEEPALIVE_INTERVAL_SEC}`,
	'-o',
	`ServerAliveCountMax=${options.keepAliveCountMax ?? SSH_DEFAULT_KEEPALIVE_COUNT_MAX}`,
	'-o',
	`StrictHostKeyChecking=${options.strictHostKeyChecking ?? 'yes'}`,
	'-o',
	`ForwardAgent=${options.forwardAgent === true ? 'yes' : 'no'}`,
	...(options.useAgent === false ? ['-o', 'IdentityAgent=none'] : []),
	...(options.knownHostsFile === undefined
		? []
		: ['-o', `UserKnownHostsFile=${options.knownHostsFile}`]),
	...(options.identityFile === undefined
		? []
		: ['-i', options.identityFile, '-o', 'IdentitiesOnly=yes']),
	...(options.port === undefined ? [] : ['-p', String(options.port)]),
	...(options.user === undefined ? [] : ['-l', options.user]),
	...(options.jumpHost === undefined
		? []
		: ['-J', jumpSpec(options.jumpHost)]),
	...(options.proxyCommand === undefined
		? []
		: [
				'-o',
				`ProxyCommand=${options.proxyCommand.map(quotePosix).join(' ')}`,
			]),
	'--',
	options.host,
];
