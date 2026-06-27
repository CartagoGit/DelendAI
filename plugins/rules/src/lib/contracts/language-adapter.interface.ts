import type { IFileReader } from '@mcp-vertex/core/public';

export interface IDetectResult {
	readonly framework: string;
	readonly presetId: string;
	readonly reason: string;
}

export interface ILanguageAdapter {
	readonly priority: number;
	detect(
		reader: IFileReader,
		areaDir: string,
	): Promise<IDetectResult | undefined>;
}
