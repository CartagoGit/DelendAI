import type { IToolSurfaceDescriptor } from '../contracts/interfaces/tool-surface.interface';

import { BOOTSTRAP_CORE_TOOL_IDS } from '../contracts/constants/bootstrap-core-tool-ids.constant';

export interface IBootstrapMeasurement {
	readonly tools: number;
	readonly bytes: number;
	readonly estimatedTokens: number;
}

export const measureBootstrapBytes = (
	descriptors: readonly IToolSurfaceDescriptor[],
): IBootstrapMeasurement => {
	const bootstrapDescriptors = descriptors.filter((descriptor) =>
		BOOTSTRAP_CORE_TOOL_IDS.includes(descriptor.toolId as never),
	);
	const bytes = Buffer.byteLength(
		JSON.stringify(
			bootstrapDescriptors.map((descriptor) => ({
				name: descriptor.name,
				toolId: descriptor.toolId,
				summary: descriptor.summary,
			})),
		),
		'utf8',
	);
	return {
		tools: bootstrapDescriptors.length,
		bytes,
		estimatedTokens: Math.ceil(bytes / 4),
	};
};
