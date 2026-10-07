import type {
	IExecOptions,
	IExecResult,
	IExecutionCapability,
	IExecutionEnvVariables,
	IPrepareResult,
	ITeardownResult,
} from './execution-env-types.interface';

/**
 * Somewhere a command can run: this machine, a container, a compose
 * service, a remote host. Every adapter implements this one shape so
 * the runner can prepare, use and release an environment without
 * knowing which kind it is.
 */
export interface IExecutionEnvironment {
	readonly id: string;
	readonly label: string;
	/** What this environment promises, given how it was configured. */
	capabilities(): readonly IExecutionCapability[];
	/** Make the environment ready. Called once before the first command. */
	prepare(): Promise<IPrepareResult>;
	/**
	 * Run one command. `command` is an argument vector: it is never
	 * joined into a shell string, so data inside it cannot become syntax.
	 */
	exec(
		command: readonly string[],
		options?: IExecOptions,
	): Promise<IExecResult>;
	/** Place a file inside the environment. */
	putFile(path: string, content: string): Promise<void>;
	/** Read a file from inside the environment. */
	getFile(path: string): Promise<string>;
	/** Release whatever `prepare` acquired and nothing else. */
	teardown(): Promise<ITeardownResult>;
	/** The variables a command run here would see, with secrets redacted. */
	env(): Promise<IExecutionEnvVariables>;
}

/** How a registry builds one environment from its configuration. */
export interface IExecutionEnvironmentRegistration<TOptions = unknown> {
	readonly id: string;
	readonly label: string;
	create(options: TOptions): IExecutionEnvironment;
}
