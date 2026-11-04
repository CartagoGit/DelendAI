import type {
	IExecOptions,
	IExecResult,
	IExecutionCapability,
	IExecutionEnvVariables,
	IPrepareResult,
	ITeardownResult,
} from '../contracts/interfaces/execution-env-types.interface';
import type { IExecutionEnvironment } from '../contracts/interfaces/execution-env.interface';
import {
	getFileViaExec,
	putFileViaExec,
} from '../helpers/file-transfer.helper';

/**
 * An environment that can only run commands: it has no filesystem API
 * of its own, so files move through `exec`. Adapters for containers and
 * remote hosts extend this and supply `exec`; transfer lives here once.
 */
export abstract class CommandOnlyEnvironment implements IExecutionEnvironment {
	abstract readonly id: string;
	abstract readonly label: string;
	abstract capabilities(): readonly IExecutionCapability[];
	abstract prepare(): Promise<IPrepareResult>;
	abstract teardown(): Promise<ITeardownResult>;
	abstract env(): Promise<IExecutionEnvVariables>;
	abstract exec(
		command: readonly string[],
		options?: IExecOptions,
	): Promise<IExecResult>;

	async putFile(path: string, content: string): Promise<void> {
		await putFileViaExec(
			(command, options) => this.exec(command, options),
			path,
			content,
		);
	}

	async getFile(path: string): Promise<string> {
		return getFileViaExec((command) => this.exec(command), path);
	}
}
