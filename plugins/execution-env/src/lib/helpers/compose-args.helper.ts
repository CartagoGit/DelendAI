import {
	COMPOSE_SHELL,
	COMPOSE_SHELL_SCRIPT,
} from '../contracts/constants/compose.constant';
import { DOCKER_BINARY } from '../contracts/constants/docker-cli.constant';
import type { IComposeExecutionOptions } from '../contracts/interfaces/compose-execution.interface';
import type { IExecOptions } from '../contracts/interfaces/execution-env-types.interface';

/**
 * `docker compose --file=F run --rm ... -- service bash -lc 'exec "$@"' bash cmd...`
 *
 * The shell text is the constant `exec "$@"`; the command follows as
 * positional parameters, so a value from data is one argument and never
 * shell syntax. `--` ends the options before the service name.
 */
export const buildComposeRunArguments = (
	options: IComposeExecutionOptions,
	composeFileAbs: string,
	command: readonly string[],
	exec: IExecOptions,
): readonly string[] => [
	DOCKER_BINARY,
	'compose',
	`--file=${composeFileAbs}`,
	...(options.projectName === undefined
		? []
		: [`--project-name=${options.projectName}`]),
	'run',
	'--rm',
	'-T',
	...(options.withDependencies === true ? [] : ['--no-deps']),
	...(options.user === undefined ? [] : [`--user=${options.user}`]),
	...((exec.cwd ?? options.workdir)
		? [`--workdir=${exec.cwd ?? options.workdir}`]
		: []),
	...(options.passEnv ?? []).map((name) => `--env=${name}`),
	...Object.entries(exec.env ?? {}).map(
		([name, value]) => `--env=${name}=${value}`,
	),
	'--',
	options.service,
	COMPOSE_SHELL,
	'-lc',
	COMPOSE_SHELL_SCRIPT,
	COMPOSE_SHELL,
	...command,
];
