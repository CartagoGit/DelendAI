import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

import type {
	IMcpLogHint,
	IMcpStdioClientOptions,
	IMcpToolDescriptor,
	IMcpTransport,
} from './mcp-transport.types';

export class McpToolError extends Error {
	/**
	 * Pointer to the log line that recorded this failure, when the
	 * server surfaced one (f00045). Absent for transport-level errors
	 * (cancel, timeout, parse failure) — the IDE uses the absence to
	 * render the no-link variant.
	 */
	readonly logHint?: IMcpLogHint;

	constructor(message: string, result: unknown, logHint?: IMcpLogHint) {
		super(message);
		this.name = 'McpToolError';
		this.result = result;
		if (logHint !== undefined) this.logHint = logHint;
	}

	readonly result: unknown;
}

/** Type guard: a well-formed `{ path, line, ts }` log hint. */
const isLogHint = (value: unknown): value is IMcpLogHint =>
	typeof value === 'object' &&
	value !== null &&
	typeof (value as Record<string, unknown>).path === 'string' &&
	typeof (value as Record<string, unknown>).line === 'number' &&
	typeof (value as Record<string, unknown>).ts === 'string';

/**
 * Best-effort extraction of a `logHint` from an `isError` result. The
 * server may put it on `structuredContent` or only inside the JSON
 * `content[0].text` envelope; we check both and validate the shape so a
 * malformed hint never produces a half-populated affordance.
 */
export const logHintFromResult = (result: {
	readonly structuredContent?: unknown;
	readonly content?: Array<{ readonly text?: string }>;
}): IMcpLogHint | undefined => {
	const fromStructured = (result.structuredContent as Record<string, unknown>)
		?.logHint;
	if (isLogHint(fromStructured)) return fromStructured;

	const text = result.content?.find(
		(entry) => entry.text !== undefined,
	)?.text;
	if (text === undefined) return undefined;
	try {
		const parsed = JSON.parse(text) as Record<string, unknown>;
		return isLogHint(parsed.logHint) ? parsed.logHint : undefined;
	} catch {
		return undefined;
	}
};

export class McpStdioClient {
	private constructor(private readonly transport: IMcpTransport) {}

	static fromTransport(transport: IMcpTransport): McpStdioClient {
		return new McpStdioClient(transport);
	}

	static async connect(
		options: IMcpStdioClientOptions,
	): Promise<McpStdioClient> {
		const client = new Client(
			{ name: '@mcp-vertex/client', version: '0.1.0' },
			{ capabilities: {} },
		);
		const transportOptions = {
			command: options.command,
			args: [...(options.args ?? [])],
			...(options.env === undefined ? {} : { env: options.env }),
			...(options.cwd === undefined ? {} : { cwd: options.cwd }),
			// The MCP SDK defaults stderr to 'inherit'. We forward the
			// caller's override (or fall back to 'inherit' so prod is
			// unchanged) so tests can silence the child server.
			stderr: options.stderr ?? 'inherit',
		};
		const transport = new StdioClientTransport(transportOptions);
		await client.connect(transport);
		return new McpStdioClient(client as unknown as IMcpTransport);
	}

	async request<TIn extends object, TOut>(
		tool: string,
		args: TIn,
	): Promise<TOut> {
		const result = await this.transport.callTool({
			name: tool,
			arguments: args,
		});
		if (result.isError) {
			throw new McpToolError(
				`MCP tool "${tool}" returned an error`,
				result,
				logHintFromResult(result),
			);
		}
		return payloadFromResult<TOut>(result);
	}

	async listTools(): Promise<readonly IMcpToolDescriptor[]> {
		const listed = await this.transport.listTools?.();
		return listed?.tools ?? [];
	}

	async close(): Promise<void> {
		await this.transport.close?.();
	}
}

export const payloadFromResult = <TOut>(result: {
	readonly structuredContent?: unknown;
	readonly content?: Array<{ readonly text?: string }>;
}): TOut => {
	if (result.structuredContent !== undefined) {
		return result.structuredContent as TOut;
	}

	const text = result.content?.find(
		(entry) => entry.text !== undefined,
	)?.text;
	if (text === undefined) {
		throw new McpToolError(
			'MCP tool returned no structured or text payload',
			result,
		);
	}

	try {
		return JSON.parse(text) as TOut;
	} catch {
		return text as TOut;
	}
};
