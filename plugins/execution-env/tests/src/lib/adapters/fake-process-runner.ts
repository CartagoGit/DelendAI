import type {
	IProcessRunOptions,
	IProcessRunResult,
	IProcessRunner,
} from '../../../../src/lib/contracts/interfaces/process-runner.interface';

/** One call a fake runner saw. */
export interface IRecordedRun {
	readonly argv: readonly string[];
	readonly options: IProcessRunOptions | undefined;
}

/**
 * A typed stand-in for the host process runner: records every call and
 * answers from a queue, so adapters are proved without docker or ssh.
 */
export class FakeProcessRunner implements IProcessRunner {
	readonly calls: IRecordedRun[] = [];

	constructor(
		private readonly replies: IProcessRunResult[] = [],
		private readonly fallback: IProcessRunResult = {
			exitCode: 0,
			stdout: '',
			stderr: '',
		},
	) {}

	async run(
		argv: readonly string[],
		options?: IProcessRunOptions,
	): Promise<IProcessRunResult> {
		this.calls.push({ argv, options });
		return this.replies.shift() ?? this.fallback;
	}
}
