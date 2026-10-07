import { randomBytes } from 'node:crypto';

import {
	DOCKER_BINARY,
	DOCKER_CONTAINER_NAME_PREFIX,
	DOCKER_CONTAINER_NAME_SUFFIX_LENGTH,
	DOCKER_DEFAULT_NETWORK,
} from '../contracts/constants/docker-cli.constant';
import type { IDockerCliOptions } from '../contracts/interfaces/docker-cli-execution.interface';
import type {
	IExecOptions,
	IExecResult,
	IExecutionCapability,
	IExecutionEnvVariables,
	IPrepareResult,
	ITeardownResult,
} from '../contracts/interfaces/execution-env-types.interface';
import type { IExecutionEnvironment } from '../contracts/interfaces/execution-env.interface';
import type { IProcessRunner } from '../contracts/interfaces/process-runner.interface';
import {
	assertMountsAllowed,
	buildExecArguments,
	buildRunArguments,
} from '../helpers/docker-args.helper';
import { inspectContainerEnvironment } from '../helpers/docker-env.helper';
import { redactEnvironment } from '../helpers/env-redaction.helper';
import { runPlanned } from '../helpers/run-planned.helper';
import { createSpawnProcessRunner } from '../runners/spawn-process-runner.service';

/** Writes stdin to a path; the path arrives as a positional parameter. */
const WRITE_FILE_SCRIPT = 'mkdir -p -- "$(dirname -- "$1")" && cat > "$1"';

const randomSuffix = (): string =>
	randomBytes(DOCKER_CONTAINER_NAME_SUFFIX_LENGTH / 2).toString('hex');

/**
 * Runs commands in a container it creates through the docker CLI. The
 * CLI is driven by spawn and never through the daemon socket, so the
 * adapter is as portable as the binary.
 *
 * Every default is the safe one: no network, an ordinary user, the
 * container removed at teardown, and nothing from the host mounted
 * unless it is listed.
 */
export class DockerCliExecutionEnvironment implements IExecutionEnvironment {
	readonly id = 'docker';
	readonly label = 'Docker';

	private readonly dryRun: boolean;
	private readonly runner: IProcessRunner;
	private readonly containerName: string;

	constructor(private readonly options: IDockerCliOptions) {
		if (options.image.trim().length === 0) {
			throw new Error('a docker execution environment needs an image');
		}
		assertMountsAllowed(
			options.mounts ?? [],
			options.allowDockerSocket === true,
		);
		this.dryRun = options.dryRun === true;
		this.runner = options.runner ?? createSpawnProcessRunner(this.dryRun);
		this.containerName =
			options.containerName ??
			`${DOCKER_CONTAINER_NAME_PREFIX}-${(options.nameSuffix ?? randomSuffix)()}`;
	}

	capabilities(): readonly IExecutionCapability[] {
		const capabilities: IExecutionCapability[] = [
			'isolated-filesystem',
			'shell-bash',
		];
		if ((this.options.network ?? DOCKER_DEFAULT_NETWORK) === 'none') {
			capabilities.push('isolated-network');
		}
		if (this.options.mounts?.some((mount) => mount.readOnly === false)) {
			capabilities.push('persistent-workspace');
		}
		if (this.options.cleanupOnExit === 'never') {
			capabilities.push('preserve-between-slices');
		}
		return capabilities;
	}

	async prepare(): Promise<IPrepareResult> {
		const argv = buildRunArguments(this.options, this.containerName);
		const result = await runPlanned({
			runner: this.runner,
			argv,
			dryRun: this.dryRun,
		});
		return {
			ok: result.exitCode === 0,
			durationMs: result.durationMs,
			dryRun: result.dryRun,
			plannedArgv: [argv],
			...(result.exitCode === 0
				? {}
				: { reason: result.stderr.trim() || 'docker run failed' }),
		};
	}

	async exec(
		command: readonly string[],
		options: IExecOptions = {},
	): Promise<IExecResult> {
		return runPlanned({
			runner: this.runner,
			argv: buildExecArguments(
				this.containerName,
				command,
				options,
				this.options.user,
			),
			dryRun: this.dryRun,
			options: {
				...(options.stdin === undefined
					? {}
					: { stdin: options.stdin }),
				...(options.timeoutMs === undefined
					? {}
					: { timeoutMs: options.timeoutMs }),
			},
		});
	}

	async putFile(path: string, content: string): Promise<void> {
		const result = await this.exec(
			['sh', '-c', WRITE_FILE_SCRIPT, 'sh', path],
			{ stdin: content },
		);
		if (result.exitCode !== 0) {
			throw new Error(`could not write ${path}: ${result.stderr.trim()}`);
		}
	}

	async getFile(path: string): Promise<string> {
		const result = await this.exec(['cat', '--', path]);
		if (result.exitCode !== 0) {
			throw new Error(`could not read ${path}: ${result.stderr.trim()}`);
		}
		return result.stdout;
	}

	async teardown(): Promise<ITeardownResult> {
		if (this.options.cleanupOnExit === 'never') {
			return { ok: true, durationMs: 0 };
		}
		const argv = [DOCKER_BINARY, 'rm', '--force', '--', this.containerName];
		const result = await runPlanned({
			runner: this.runner,
			argv,
			dryRun: this.dryRun,
		});
		return {
			ok: result.exitCode === 0,
			durationMs: result.durationMs,
			dryRun: result.dryRun,
			plannedArgv: [argv],
			...(result.exitCode === 0
				? {}
				: { reason: result.stderr.trim() || 'docker rm failed' }),
		};
	}

	async env(): Promise<IExecutionEnvVariables> {
		if (this.dryRun) {
			return redactEnvironment(
				this.options.env ?? {},
				this.options.redaction,
			);
		}
		return redactEnvironment(
			await inspectContainerEnvironment(this.runner, this.containerName),
			this.options.redaction,
		);
	}
}
