import type {
	IExecOptions,
	IExecResult,
} from './execution-env-types.interface';

/** Anything that can run a command inside an environment. */
export type IExecFunction = (
	command: readonly string[],
	options?: IExecOptions,
) => Promise<IExecResult>;
