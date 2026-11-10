import {
	resolveWorkspaceContainedEffective,
	SafeWorkspaceReader,
} from '@delendai/core/public';

import type {
	IComposeFile,
	IComposeService,
} from '../contracts/interfaces/compose-file.interface';
import type { IComposeExecutionOptions } from '../contracts/interfaces/compose-execution.interface';
import type {
	IExecOptions,
	IExecResult,
	IExecutionCapability,
	IExecutionEnvVariables,
	IPrepareResult,
	ITeardownResult,
} from '../contracts/interfaces/execution-env-types.interface';
import { CommandOnlyEnvironment } from './command-only-environment.service';
import type { IProcessRunner } from '../contracts/interfaces/process-runner.interface';
import { buildComposeRunArguments } from '../helpers/compose-args.helper';
import { parseComposeFile } from '../helpers/compose-parser.helper';
import { redactEnvironment } from '../helpers/env-redaction.helper';
import { runPlanned } from '../helpers/run-planned.helper';
import { createSpawnProcessRunner } from '../runners/spawn-process-runner.service';

/**
 * One service of a compose file as an execution environment. Every
 * command is its own `docker compose run --rm`, so the service starts
 * fresh and is removed after the command; nothing has to be released.
 *
 * Dependencies are not started unless asked for, and resource limits are
 * read from the file and checked against a ceiling the caller can set.
 */
export class DockerComposeExecutionEnvironment extends CommandOnlyEnvironment {
	readonly id = 'docker-compose';
	readonly label = 'Docker Compose';

	private readonly dryRun: boolean;
	private readonly runner: IProcessRunner;
	private parsed: IComposeFile | undefined;

	constructor(private readonly options: IComposeExecutionOptions) {
		super();
		this.dryRun = options.dryRun === true;
		this.runner = options.runner ?? createSpawnProcessRunner(this.dryRun);
	}

	capabilities(): readonly IExecutionCapability[] {
		return ['isolated-filesystem', 'shell-bash'];
	}

	/** The parsed service, once `prepare` has read the compose file. */
	service(): IComposeService | undefined {
		return this.parsed?.services[this.options.service];
	}

	async prepare(): Promise<IPrepareResult> {
		try {
			const parsed = await this.load();
			const service = parsed.services[this.options.service];
			if (service === undefined) {
				const known = Object.keys(parsed.services).join(', ');
				return failure(
					`service "${this.options.service}" is not in ${this.options.composeFile}; services: ${known || '(none)'}`,
				);
			}
			const reason = limitViolation(service, this.options.requireLimits);
			return reason === undefined
				? { ok: true, durationMs: 0 }
				: failure(reason);
		} catch (error) {
			return failure(
				error instanceof Error ? error.message : String(error),
			);
		}
	}

	async exec(
		command: readonly string[],
		options: IExecOptions = {},
	): Promise<IExecResult> {
		const file = await resolveWorkspaceContainedEffective(
			this.options.workspaceRoot,
			this.options.composeFile,
		);
		if (!file.ok) {
			throw new Error(
				`compose file leaves the workspace: ${file.reason ?? ''}`,
			);
		}
		return runPlanned({
			runner: this.runner,
			argv: buildComposeRunArguments(
				this.options,
				file.abs,
				command,
				options,
			),
			dryRun: this.dryRun,
			options: {
				cwd: this.options.workspaceRoot,
				...(options.stdin === undefined
					? {}
					: { stdin: options.stdin }),
				...(options.timeoutMs === undefined
					? {}
					: { timeoutMs: options.timeoutMs }),
			},
		});
	}

	async teardown(): Promise<ITeardownResult> {
		return { ok: true, durationMs: 0 };
	}

	/** What the service declares, plus the names forwarded from the host. */
	async env(): Promise<IExecutionEnvVariables> {
		const service = (await this.load()).services[this.options.service];
		const declared = service?.environment ?? {};
		const forwarded: Record<string, string> = {};
		for (const name of this.options.passEnv ?? []) forwarded[name] = '';
		return redactEnvironment(
			{ ...declared, ...forwarded },
			this.options.redaction,
		);
	}

	private async load(): Promise<IComposeFile> {
		if (this.parsed === undefined) {
			const reader = new SafeWorkspaceReader(this.options.workspaceRoot);
			const text = (await reader.readText(this.options.composeFile))
				.content;
			this.parsed = parseComposeFile(text);
		}
		return this.parsed;
	}
}

const failure = (reason: string): IPrepareResult => ({
	ok: false,
	reason,
	durationMs: 0,
});

/** Why a service's declared limits do not satisfy the required ceiling. */
const limitViolation = (
	service: IComposeService,
	required: IComposeExecutionOptions['requireLimits'],
): string | undefined => {
	if (required?.memoryBytes !== undefined) {
		const declared = service.limits.memoryBytes;
		if (declared === undefined || declared > required.memoryBytes) {
			return `service "${service.name}" must declare a memory limit of at most ${required.memoryBytes} bytes`;
		}
	}
	if (required?.cpus !== undefined) {
		const declared = service.limits.cpus;
		if (declared === undefined || declared > required.cpus) {
			return `service "${service.name}" must declare at most ${required.cpus} cpus`;
		}
	}
	return undefined;
};
