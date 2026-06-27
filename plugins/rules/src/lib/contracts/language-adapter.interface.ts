import type { IFileReader } from '@mcp-vertex/core/public';

import type { ICommandSetProvider } from './command-set-provider.interface';

export interface IDetectResult {
	readonly presetId: string;
	readonly reason: string;
}

export type ILanguageDetection = IDetectResult;

export interface ILanguageAdapter {
	readonly id: string;
	readonly priority: number;
	detect(
		reader: IFileReader,
		areaDir: string,
		deps: Readonly<Record<string, string>>,
	): Promise<IDetectResult | undefined>;
	readonly commands?: ICommandSetProvider;
}
