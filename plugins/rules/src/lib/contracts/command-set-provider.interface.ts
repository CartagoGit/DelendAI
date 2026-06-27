import type { ICommandSet } from './command-set.interface';

export interface ICommandSetProvider {
	resolveCommandSet(areaDir: string): ICommandSet;
}
