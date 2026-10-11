import type {
	IProcessRunOptions,
	IProcessRunner,
} from './process-runner.interface';

/** What `runPlanned` needs to either plan or perform one host command. */
export interface IRunPlannedInput {
	readonly runner: IProcessRunner;
	/** The exact argument vector for the host binary. */
	readonly argv: readonly string[];
	readonly options?: IProcessRunOptions;
	readonly dryRun: boolean;
	/** Injected so specs control time. */
	readonly now?: () => number;
}
