import type { IFileReader } from '@mcp-vertex/core/public';

import type { IDetectResult } from '../contracts/language-adapter.interface';

import { buildDefaultRegistry } from './registry/default-registry';

export type { IDetectResult } from '../contracts/language-adapter.interface';

const DEFAULT_DETECTOR = buildDefaultRegistry().detector;

export const detectPresetForArea = async (
	reader: IFileReader,
	areaDir: string,
): Promise<IDetectResult> => {
	const detected = await DEFAULT_DETECTOR.detect(reader, areaDir);
	if (detected !== undefined) {
		return detected;
	}
	return {
		presetId: 'vanilla-js',
		reason: 'no framework or TS detected',
	};
};
