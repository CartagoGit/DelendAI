import type { ICommandSet } from './command-set.interface';

export interface ICommandSetProvider {
	buildCommandSet(
		areaDir: string,
		rules: Readonly<{
			readonly linterConfigs: readonly string[];
			readonly typecheckConfigs: readonly string[];
		}>,
	): ICommandSet;
}
