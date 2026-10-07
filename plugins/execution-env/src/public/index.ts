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
