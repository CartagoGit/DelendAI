import { DockerCliExecutionEnvironment } from '../adapters/docker-cli.service';
import { DockerComposeExecutionEnvironment } from '../adapters/docker-compose.service';
import { DockerExecExecutionEnvironment } from '../adapters/docker-exec.service';
import { LocalExecutionEnvironment } from '../adapters/local.service';
import { SshExecutionEnvironment } from '../adapters/ssh.service';
import type { IComposeExecutionOptions } from '../contracts/interfaces/compose-execution.interface';
import type { IDockerCliOptions } from '../contracts/interfaces/docker-cli-execution.interface';
import type { IDockerExecOptions } from '../contracts/interfaces/docker-exec-execution.interface';
import type { ILocalExecutionOptions } from '../contracts/interfaces/local-execution.interface';
import type { ISshExecutionOptions } from '../contracts/interfaces/ssh-execution.interface';
import { ExecutionEnvRegistry } from './execution-env-registry.service';

/**
 * A registry holding every adapter this package ships, under the ids a
 * config file uses: `local`, `docker-cli`, `docker-compose`, `docker-exec`
 * and `ssh`. Each id builds its adapter from that adapter's own options.
 */
export const createBuiltInExecutionEnvRegistry = (): ExecutionEnvRegistry =>
	new ExecutionEnvRegistry()
		.register<ILocalExecutionOptions>({
			id: 'local',
			label: 'This machine',
			create: (options) => new LocalExecutionEnvironment(options),
		})
		.register<IDockerCliOptions>({
			id: 'docker-cli',
			label: 'Docker container',
			create: (options) => new DockerCliExecutionEnvironment(options),
		})
		.register<IComposeExecutionOptions>({
			id: 'docker-compose',
			label: 'Docker Compose service',
			create: (options) => new DockerComposeExecutionEnvironment(options),
		})
		.register<IDockerExecOptions>({
			id: 'docker-exec',
			label: 'Running Docker container',
			create: (options) => new DockerExecExecutionEnvironment(options),
		})
		.register<ISshExecutionOptions>({
			id: 'ssh',
			label: 'Remote host over SSH',
			create: (options) => new SshExecutionEnvironment(options),
		});
