// effect-boundary-authorized: the local adapter reads the host process environment; files go through the safe workspace reader and the atomic writer.
import {
	resolveWorkspaceContainedEffective,
	SafeWorkspaceReader,
	writeFileAtomic,
} from '@delendai/core/public';

import type {
	IExecOptions,
	IExecResult,
	IExecutionCapability,
	IExecutionEnvVariables,
	IPrepareResult,
	ITeardownResult,
} from '../contracts/interfaces/execution-env-types.interface';
import type { IExecutionEnvironment } from '../contracts/interfaces/execution-env.interface';
import type { ILocalExecutionOptions } from '../contracts/interfaces/local-execution.interface';
import type { IProcessRunner } from '../contracts/interfaces/process-runner.interface';
import { redactEnvironment } from '../helpers/env-redaction.helper';
import { runPlanned } from '../helpers/run-planned.helper';
import { createSpawnProcessRunner } from '../runners/spawn-process-runner.service';

const LOCAL_CAPABILITIES: readonly IExecutionCapability[] = [
	'persistent-workspace',
	'preserve-between-slices',
	'shell-bash',
];

/**
 * Runs commands on this machine, in the workspace. It isolates nothing,
 * so it promises nothing about isolation; `prepare` and `teardown` have
 * nothing to acquire or release and succeed at once.
 */
export class LocalExecutionEnvironment implements IExecutionEnvironment {
	readonly id = 'local';
	readonly label = 'Local';

	private readonly dryRun: boolean;
	private readonly runner: IProcessRunner;

	constructor(private readonly options: ILocalExecutionOptions) {
		this.dryRun = options.dryRun === true;
		this.runner = options.runner ?? createSpawnProcessRunner(this.dryRun);
	}

	capabilities(): readonly IExecutionCapability[] {
		return LOCAL_CAPABILITIES;
	}

	async prepare(): Promise<IPrepareResult> {
		return { ok: true, durationMs: 0 };
	}

	async teardown(): Promise<ITeardownResult> {
		return { ok: true, durationMs: 0 };
	}

	async exec(
		command: readonly string[],
		options: IExecOptions = {},
	): Promise<IExecResult> {
		return runPlanned({
			runner: this.runner,
			argv: command,
			dryRun: this.dryRun,
			options: {
				cwd: options.cwd ?? this.options.workspaceRoot,
				env: this.commandEnvironment(options.env),
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
		const target = await resolveWorkspaceContainedEffective(
			this.options.workspaceRoot,
			path,
		);
		if (!target.ok) {
			throw new Error(
				`path leaves the workspace: ${target.reason ?? path}`,
			);
		}
		if (this.dryRun) return;
		await writeFileAtomic(target.abs, content);
	}

	async getFile(path: string): Promise<string> {
		const reader = new SafeWorkspaceReader(this.options.workspaceRoot);
		return (await reader.readText(path)).content;
	}

	async env(): Promise<IExecutionEnvVariables> {
		return redactEnvironment(this.baseEnv(), this.options.redaction);
	}

	private baseEnv(): Readonly<Record<string, string | undefined>> {
		return this.options.baseEnv ?? process.env;
	}

	/** The real values: redaction is for what is shown, not for what runs. */
	private commandEnvironment(
		extra: Readonly<Record<string, string>> | undefined,
	): Readonly<Record<string, string>> {
		const merged: Record<string, string> = {};
		for (const [name, value] of Object.entries(this.baseEnv())) {
			if (value !== undefined) merged[name] = value;
		}
		return { ...merged, ...extra };
	}
}
