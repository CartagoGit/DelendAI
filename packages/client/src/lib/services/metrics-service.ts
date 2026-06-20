import type { McpVertexToolOutputs } from '@mcp-vertex/core/public';

import type { McpStdioClient } from '../transport/mcp-stdio-client';

export type IMetricsSnapshot = McpVertexToolOutputs['mcp-vertex_metrics'];

export interface IMetricsSnapshotOptions {
	readonly reset?: boolean;
	readonly persist?: boolean;
}

export interface IMetricsStreamOptions {
	readonly signal?: AbortSignal;
}

export class MetricsService {
	constructor(private readonly client: McpStdioClient) {}

	async snapshot(
		options: IMetricsSnapshotOptions = {},
	): Promise<IMetricsSnapshot> {
		return this.client.request<IMetricsSnapshotOptions, IMetricsSnapshot>(
			'mcp-vertex_metrics',
			options,
		);
	}

	async *stream(
		intervalMs: number,
		options: IMetricsStreamOptions = {},
	): AsyncIterable<IMetricsSnapshot> {
		while (options.signal?.aborted !== true) {
			yield await this.snapshot();
			await wait(intervalMs, options.signal);
		}
	}
}

const wait = async (
	intervalMs: number,
	signal?: AbortSignal,
): Promise<void> => {
	if (signal?.aborted === true) return;
	await new Promise<void>((resolve) => {
		const timer = setTimeout(resolve, intervalMs);
		signal?.addEventListener(
			'abort',
			() => {
				clearTimeout(timer);
				resolve();
			},
			{ once: true },
		);
	});
};
