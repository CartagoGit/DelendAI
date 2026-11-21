import type { ICliCommandResult } from './cli-command.interface';

export interface IAnswerSizeInput {
	readonly verb: string;
	readonly result: ICliCommandResult;
	readonly verbose: boolean;
	readonly json: boolean;
	readonly cwd: string;
}
