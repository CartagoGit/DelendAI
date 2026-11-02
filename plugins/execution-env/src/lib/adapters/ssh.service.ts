import { basename } from 'node:path';
import {
	POWERSHELL_READ_SCRIPT,
	POWERSHELL_WRITE_SCRIPT,
	REMOTE_PATH_VARIABLE,
} from '../contracts/constants/ssh.constant';
import type {
	IExecOptions,
	IExecResult,
	IExecutionCapability,
	IExecutionEnvVariables,
	IPrepareResult,
	ITeardownResult,
} from '../contracts/interfaces/execution-env-types.interface';
import type { ISshExecutionOptions } from '../contracts/interfaces/ssh-execution.interface';
import type { IProcessRunner } from '../contracts/interfaces/process-runner.interface';
import { parseEnvironmentEntries } from '../helpers/docker-env.helper';
import { redactEnvironment } from '../helpers/env-redaction.helper';
import { runPlanned } from '../helpers/run-planned.helper';
import { buildRemoteCommand } from '../helpers/shell-quoting.helper';
import { assertSshOptions, buildSshPrefix } from '../helpers/ssh-args.helper';
import { createSpawnProcessRunner } from '../runners/spawn-process-runner.service';
import { CommandOnlyEnvironment } from './command-only-environment.service';
import {
	DEFAULT_SSH_ALLOWED_PROGRAMS,
	SSH_PROBE_PROGRAMS,
} from '../contracts/constants/ssh.constant';

/**
 * Runs commands on a remote host over ssh. Each command is its own
 * connection, so there is nothing to keep open and nothing to release.
 *
 * Defaults are the cautious ones: batch mode (never prompts), strict
 * host keys, no agent forwarding, and a keepalive that notices a dead
 * link in two minutes. The remote command has to be one string, so it
 * is quoted for the remote shell's own dialect.
 */
export class SshExecutionEnvironment extends CommandOnlyEnvironment {
	readonly id = 'ssh';
	readonly label = 'SSH';

	private readonly dryRun: boolean;
	private readonly runner: IProcessRunner;

	constructor(private readonly options: ISshExecutionOptions) {
		super();
		assertSshOptions(options);
		this.dryRun = options.dryRun === true;
		this.runner = options.runner ?? createSpawnProcessRunner(this.dryRun);
	}

	capabilities(): readonly IExecutionCapability[] {
		const capabilities: IExecutionCapability[] = [
			'persistent-workspace',
			'preserve-between-slices',
			this.dialect() === 'posix' ? 'shell-bash' : 'shell-pwsh',
		];
		if (this.options.forwardAgent === true) {
			capabilities.push('forward-secrets');
		}
		return capabilities;
	}

	async prepare(): Promise<IPrepareResult> {
		const probe = await this.runRemote([
			this.dialect() === 'posix' ? 'true' : 'hostname',
		]);
		return {
			ok: probe.exitCode === 0,
			durationMs: probe.durationMs,
			dryRun: probe.dryRun,
			plannedArgv: [probe.plannedArgv],
			...(probe.exitCode === 0
				? {}
				: { reason: probe.stderr.trim() || 'ssh connection failed' }),
		};
	}

	/**
	 * A caller's command, held to the allowlist: quoting keeps its data from
	 * becoming syntax, the allowlist keeps it from naming any program the
	 * remote account can run.
	 */
	async exec(
		command: readonly string[],
		options: IExecOptions = {},
	): Promise<IExecResult> {
		const program = basename(command[0] ?? '');
		const allowed = [
			...(this.options.allowedPrograms ?? DEFAULT_SSH_ALLOWED_PROGRAMS),
			...SSH_PROBE_PROGRAMS,
		];
		if (!allowed.includes(program)) {
			throw new Error(
				`"${program}" is not an allowed program for this host (${allowed.join(', ')})`,
			);
		}
		return this.runRemote(command, options);
	}

	/** A command this adapter builds itself: probes, file moves, env reads. */
	private async runRemote(
		command: readonly string[],
		options: IExecOptions = {},
	): Promise<IExecResult> {
		const remote = buildRemoteCommand(
			{
				command,
				...(options.cwd === undefined ? {} : { cwd: options.cwd }),
				...(options.env === undefined ? {} : { env: options.env }),
			},
			this.dialect(),
		);
		return runPlanned({
			runner: this.runner,
			argv: [...buildSshPrefix(this.options), remote],
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

	override async putFile(path: string, content: string): Promise<void> {
		if (this.dialect() === 'posix') return super.putFile(path, content);
		const result = await this.runRemote(
			['powershell', '-NoProfile', '-Command', POWERSHELL_WRITE_SCRIPT],
			{ stdin: content, env: { [REMOTE_PATH_VARIABLE]: path } },
		);
		if (result.exitCode !== 0) {
			throw new Error(`could not write ${path}: ${result.stderr.trim()}`);
		}
	}

	override async getFile(path: string): Promise<string> {
		if (this.dialect() === 'posix') return super.getFile(path);
		const result = await this.runRemote(
			['powershell', '-NoProfile', '-Command', POWERSHELL_READ_SCRIPT],
			{ env: { [REMOTE_PATH_VARIABLE]: path } },
		);
		if (result.exitCode !== 0) {
			throw new Error(`could not read ${path}: ${result.stderr.trim()}`);
		}
		return result.stdout;
	}

	async teardown(): Promise<ITeardownResult> {
		return { ok: true, durationMs: 0 };
	}

	async env(): Promise<IExecutionEnvVariables> {
		const listing =
			this.dialect() === 'posix'
				? await this.runRemote(['env'])
				: await this.runRemote(['cmd', '/c', 'set']);
		if (listing.exitCode !== 0) {
			throw new Error(
				`could not read the remote environment: ${listing.stderr.trim()}`,
			);
		}
		return redactEnvironment(
			parseEnvironmentEntries(listing.stdout.split(/\r?\n/)),
			this.options.redaction,
		);
	}

	private dialect(): 'posix' | 'powershell' {
		return this.options.remoteDialect ?? 'posix';
	}
}
