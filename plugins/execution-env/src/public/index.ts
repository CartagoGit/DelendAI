/**
 * Public surface of `@delendai/execution-env`: the contract, the
 * capability vocabulary and the registry. Adapters are added here as
 * they ship.
 */

export { default } from '../index';

export { EXECUTION_CAPABILITIES } from '../lib/contracts/constants/execution-capability.constant';
export type {
	IExecutionEnvironment,
	IExecutionEnvironmentRegistration,
} from '../lib/contracts/interfaces/execution-env.interface';
export type {
	IExecOptions,
	IExecResult,
	IExecutionCapability,
	IExecutionEnvVariables,
	IPrepareResult,
	ITeardownResult,
} from '../lib/contracts/interfaces/execution-env-types.interface';
export { ExecutionEnvRegistry } from '../lib/registry/execution-env-registry.service';

export { REDACTED_VALUE } from '../lib/contracts/constants/env-redaction.constant';
export type { IEnvRedactionPolicy } from '../lib/contracts/interfaces/env-redaction.interface';
export type { ILocalExecutionOptions } from '../lib/contracts/interfaces/local-execution.interface';
export type {
	IProcessRunOptions,
	IProcessRunResult,
	IProcessRunner,
} from '../lib/contracts/interfaces/process-runner.interface';
export {
	defaultEnvRedactionPolicy,
	redactEnvironment,
} from '../lib/helpers/env-redaction.helper';
export { runPlanned } from '../lib/helpers/run-planned.helper';
export { LocalExecutionEnvironment } from '../lib/adapters/local.service';
export { createSpawnProcessRunner } from '../lib/runners/spawn-process-runner.service';
export { DockerCliExecutionEnvironment } from '../lib/adapters/docker-cli.service';
export type {
	IDockerCliOptions,
	IDockerMount,
} from '../lib/contracts/interfaces/docker-cli-execution.interface';
export {
	inspectContainerEnvironment,
	parseEnvironmentEntries,
} from '../lib/helpers/docker-env.helper';
export { DockerComposeExecutionEnvironment } from '../lib/adapters/docker-compose.service';
export type { IComposeExecutionOptions } from '../lib/contracts/interfaces/compose-execution.interface';
export type {
	IComposeFile,
	IComposeLimits,
	IComposeService,
} from '../lib/contracts/interfaces/compose-file.interface';
export {
	parseComposeFile,
	parseMemoryLimit,
} from '../lib/helpers/compose-parser.helper';
export { SshExecutionEnvironment } from '../lib/adapters/ssh.service';
export { CommandOnlyEnvironment } from '../lib/adapters/command-only-environment.service';
export type {
	ISshExecutionOptions,
	ISshJumpHost,
	ISshRemoteDialect,
} from '../lib/contracts/interfaces/ssh-execution.interface';
export {
	buildRemoteCommand,
	quotePosix,
	quotePowerShell,
	quoteWord,
} from '../lib/helpers/shell-quoting.helper';
export { DockerExecExecutionEnvironment } from '../lib/adapters/docker-exec.service';
export type { IDockerExecOptions } from '../lib/contracts/interfaces/docker-exec-execution.interface';
