import {
	DOCKER_BINARY,
	DOCKER_CONTAINER_REFERENCE_PATTERN,
	DOCKER_INSPECT_RUNNING_FORMAT,
} from '../contracts/constants/docker-cli.constant';
import type { IDockerExecOptions } from '../contracts/interfaces/docker-exec-execution.interface';
import type {
	IExecOptions,
	IExecResult,
	IExecutionCapability,
	IExecutionEnvVariables,
	IPrepareResult,
	ITeardownResult,
} from '../contracts/interfaces/execution-env-types.interface';
import type { IProcessRunner } from '../contracts/interfaces/process-runner.interface';
import { buildExecArguments } from '../helpers/docker-args.helper';
import { inspectContainerEnvironment } from '../helpers/docker-env.helper';
import { redactEnvironment } from '../helpers/env-redaction.helper';
import { runPlanned } from '../helpers/run-planned.helper';
import { createSpawnProcessRunner } from '../runners/spawn-process-runner.service';
import { CommandOnlyEnvironment } from './command-only-environment.service';

/**
 * Runs commands inside a container that already exists. The container
 * belongs to someone else (a compose sidecar, a dev container), so this
 * adapter never starts, stops or removes it: `teardown` releases nothing.
 */
export class DockerExecExecutionEnvironment extends CommandOnlyEnvironment {
	readonly id = 'docker-exec';
	readonly label = 'Docker Exec';

	private readonly dryRun: boolean;
	private readonly runner: IProcessRunner;

	constructor(private readonly options: IDockerExecOptions) {
		super();
		if (!DOCKER_CONTAINER_REFERENCE_PATTERN.test(options.container)) {
			throw new Error(
				`not a valid container name or id: ${options.container}`,
			);
		}
		this.dryRun = options.dryRun === true;
		this.runner = options.runner ?? createSpawnProcessRunner(this.dryRun);
	}

	capabilities(): readonly IExecutionCapability[] {
		return [
			'isolated-filesystem',
			'persistent-workspace',
			'preserve-between-slices',
			'shell-bash',
		];
	}

	/** Confirms the container exists and is running; changes nothing. */
	async prepare(): Promise<IPrepareResult> {
		const argv = [
			DOCKER_BINARY,
			'inspect',
			`--format=${DOCKER_INSPECT_RUNNING_FORMAT}`,
			'--',
			this.options.container,
		];
		const result = await runPlanned({
			runner: this.runner,
			argv,
			dryRun: this.dryRun,
		});
		const running = result.stdout.trim() === 'true';
		const ok = result.dryRun || (result.exitCode === 0 && running);
		return {
			ok,
			durationMs: result.durationMs,
			dryRun: result.dryRun,
			plannedArgv: [argv],
			...(ok
				? {}
				: {
						reason:
							result.exitCode !== 0
								? result.stderr.trim() ||
									'docker inspect failed'
								: `container ${this.options.container} is not running`,
					}),
		};
	}

	async exec(
		command: readonly string[],
		options: IExecOptions = {},
	): Promise<IExecResult> {
		return runPlanned({
			runner: this.runner,
			argv: buildExecArguments(
				this.options.container,
				command,
				this.withDefaultDirectory(options),
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

	private withDefaultDirectory(options: IExecOptions): IExecOptions {
		const cwd = options.cwd ?? this.options.workdir;
		return cwd === undefined ? options : { ...options, cwd };
	}

	/** The container was there before us and stays after: nothing to stop. */
	async teardown(): Promise<ITeardownResult> {
		return { ok: true, durationMs: 0 };
	}

	async env(): Promise<IExecutionEnvVariables> {
		return redactEnvironment(
			await inspectContainerEnvironment(
				this.runner,
				this.options.container,
			),
			this.options.redaction,
		);
	}
}
