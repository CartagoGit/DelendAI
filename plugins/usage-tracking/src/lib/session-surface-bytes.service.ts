import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';

import {
	measureBootstrapBytes,
	readAbsoluteTextSafe,
	type IPluginLogsHelper,
	type IMcpToolWireDefinition,
} from '@delendai/core/public';

import { RecordBuffer } from './record-buffer';

const TOOLS_LIST_METHOD = 'tools/list';
const OBSERVER_INSTALLED = Symbol.for(
	'mcp-vertex.usage-tracking.session-surface-bytes-observer',
);

export interface ISessionSurfaceBytesRecord {
	readonly ts: string;
	readonly sessionId: string;
	readonly servedBytes: number;
	readonly tools: number;
}

export interface ISessionSurfaceBytesServiceOptions {
	readonly maxDelayMs?: number;
	readonly maxBatch?: number;
	readonly logs?: IPluginLogsHelper | undefined;
}

interface IToolsListResult {
	readonly tools?: readonly IMcpToolWireDefinition[];
}

interface IToolsListExtra {
	readonly sessionId?: string | undefined;
}

interface IObservedServer {
	_requestHandlers?: Map<
		string,
		(request: unknown, extra: IToolsListExtra) => unknown
	>;
	setRequestHandler?: (
		schema: typeof ListToolsRequestSchema,
		handler: (request: unknown, extra: IToolsListExtra) => unknown,
	) => void;
	[OBSERVER_INSTALLED]?: boolean;
}

const measureServedBytes = (
	result: unknown,
): { servedBytes: number; tools: number } => {
	const tools = Array.isArray((result as IToolsListResult | null)?.tools)
		? (((result as IToolsListResult).tools ??
				[]) as readonly IMcpToolWireDefinition[])
		: [];
	const measurement = measureBootstrapBytes(tools);
	return { servedBytes: measurement.bytes, tools: measurement.tools };
};

export const readSessionSurfaceBytes = async (
	absPath: string,
): Promise<ISessionSurfaceBytesRecord[]> => {
	let raw: string;
	try {
		raw = await readAbsoluteTextSafe(absPath);
	} catch {
		return [];
	}
	const out: ISessionSurfaceBytesRecord[] = [];
	for (const line of raw.split('\n')) {
		const trimmed = line.trim();
		if (trimmed === '') continue;
		try {
			out.push(JSON.parse(trimmed) as ISessionSurfaceBytesRecord);
		} catch {
			// Skip partial/corrupt tail rows; the next flush completes them.
		}
	}
	return out;
};

export const sumSessionSurfaceBytes = (
	records: readonly ISessionSurfaceBytesRecord[],
): Readonly<Record<string, number>> => {
	const totals: Record<string, number> = {};
	for (const record of records) {
		totals[record.sessionId] =
			(totals[record.sessionId] ?? 0) + Math.max(0, record.servedBytes);
	}
	return totals;
};

export class SessionSurfaceBytesService {
	private readonly buffer: RecordBuffer;

	constructor(
		readonly filePath: string,
		options: ISessionSurfaceBytesServiceOptions = {},
	) {
		this.buffer = new RecordBuffer(filePath, options);
	}

	record(input: {
		readonly sessionId: string;
		readonly servedBytes: number;
		readonly tools: number;
		readonly at?: number | undefined;
	}): void {
		this.buffer.push({
			ts: new Date(input.at ?? Date.now()).toISOString(),
			sessionId: input.sessionId,
			servedBytes: Math.max(0, input.servedBytes),
			tools: Math.max(0, input.tools),
		} satisfies ISessionSurfaceBytesRecord);
	}

	async close(): Promise<void> {
		await this.buffer.close();
	}
}

export const installSessionSurfaceBytesObserver = (input: {
	readonly server: McpServer;
	readonly service: SessionSurfaceBytesService;
	readonly defaultSessionId: string;
}): void => {
	const internalServer = input.server.server;
	if (internalServer === undefined) return;
	const internal = internalServer as unknown as IObservedServer;
	if (internal[OBSERVER_INSTALLED]) return;
	const original = internal._requestHandlers?.get(TOOLS_LIST_METHOD);
	if (original === undefined || internal.setRequestHandler === undefined) {
		return;
	}
	internal.setRequestHandler(
		ListToolsRequestSchema,
		async (request: unknown, extra: IToolsListExtra) => {
			const result = await original(request, extra);
			const { servedBytes, tools } = measureServedBytes(result);
			input.service.record({
				sessionId: extra.sessionId ?? input.defaultSessionId,
				servedBytes,
				tools,
			});
			return result;
		},
	);
	internal[OBSERVER_INSTALLED] = true;
};
