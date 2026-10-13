import type {
	IExecutionEnvironmentModule,
	IExecutionEnvironmentSelection,
	ILifecycleEnvironment,
} from '../contracts/interfaces/execution-env-lifecycle.interface';

const PACKAGE = '@delendai/execution-env/public';

const importPackage = (): Promise<IExecutionEnvironmentModule> =>
	import(PACKAGE) as Promise<IExecutionEnvironmentModule>;

/**
 * Build the configured execution environment from the built-in registry of
 * `@delendai/execution-env`. The package is an optional peer, so it is
 * imported only when an environment is configured; a missing package or an
 * unknown id fails here, at register, with a message saying what to do.
 */
export const loadExecutionEnvironment = async (
	selection: IExecutionEnvironmentSelection,
	load: () => Promise<IExecutionEnvironmentModule> = importPackage,
): Promise<ILifecycleEnvironment> => {
	let module: IExecutionEnvironmentModule;
	try {
		module = await load();
	} catch (error) {
		const reason = error instanceof Error ? error.message : String(error);
		throw new Error(
			`orchestrator-runner: executionEnvironment "${selection.id}" needs the optional package @delendai/execution-env (install it): ${reason}`,
		);
	}
	try {
		return module
			.createBuiltInExecutionEnvRegistry()
			.create(selection.id, selection.options);
	} catch (error) {
		const reason = error instanceof Error ? error.message : String(error);
		throw new Error(
			`orchestrator-runner: executionEnvironment "${selection.id}" could not be created: ${reason}`,
		);
	}
};
