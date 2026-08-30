import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import type { ZodType } from 'zod';

import {
	MCP_VERTEX_CLIENT_NAME,
	MCP_VERTEX_CLIENT_VERSION,
} from '../contracts/constants/client-package.constant';
import { MCP_TRANSPORT_ERROR_CODES } from '../contracts/constants/mcp-transport-error.constant';
import type {
	IMcpTransportError,
	McpTransportErrorKind,
} from '../contracts/interfaces/mcp-transport-error.interface';
import type {
	IMcpLogHint,
	IMcpStdioClientOptions,
	IMcpToolCallResult,
	IMcpToolDescriptor,
	IMcpTransport,
} from '../contracts/interfaces/mcp-transport.interface';

interface IMcpSdkBindings {
	readonly ClientCtor: typeof Client;
	readonly StdioClientTransportCtor: typeof StdioClientTransport;
}

const defaultSdkBindings = (): IMcpSdkBindings => ({
	ClientCtor: Client,
	StdioClientTransportCtor: StdioClientTransport,
});

let sdkBindings: IMcpSdkBindings = defaultSdkBindings();

export const __setMcpSdkBindingsForTests = (
	overrides: Partial<IMcpSdkBindings>,
): void => {
	sdkBindings = { ...sdkBindings, ...overrides };
};

export const __resetMcpSdkBindingsForTests = (): void => {
	sdkBindings = defaultSdkBindings();
};

class McpTransportError extends Error implements IMcpTransportError {
	readonly code;
	readonly kind;
	override readonly cause?;

	constructor(kind: McpTransportErrorKind, message: string, cause?: unknown) {
		super(message);
		this.name = 'McpTransportError';
		this.kind = kind;
		this.code = MCP_TRANSPORT_ERROR_CODES[kind];
		if (cause !== undefined) this.cause = cause;
	}
}

export class McpToolError
	extends McpTransportError
	implements IMcpTransportError
{
	/**
	 * Pointer to the log line that recorded this failure, when the
	 * server surfaced one (f00045). Absent for transport-level errors
	 * (cancel, timeout, parse failure) — the IDE uses the absence to
	 * render the no-link variant.
	 */
	readonly logHint?: IMcpLogHint;

	constructor(message: string, result: unknown, logHint?: IMcpLogHint) {
		super('tool-error', message, result);
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

const isMcpTransportError = (value: unknown): value is IMcpTransportError =>
	typeof value === 'object' &&
	value !== null &&
	typeof (value as Record<string, unknown>).kind === 'string' &&
	typeof (value as Record<string, unknown>).code === 'string';

const textFromUnknown = (value: unknown): string | undefined => {
	if (typeof value === 'string') return value;
	if (value instanceof Error) {
		// A generic `Error` name adds no information over the message
		// (it would just read "Error <message>"); only prefix a
		// distinctive subclass name (e.g. "TypeError: message").
		return value.name === 'Error' || value.name.length === 0
			? value.message
			: `${value.name}: ${value.message}`;
	}
	if (typeof value === 'object' && value !== null) {
		const record = value as Record<string, unknown>;
		return [record.name, record.message, record.code]
			.filter((entry): entry is string => typeof entry === 'string')
			.join(' ');
	}
	return undefined;
};

const classifyTransportErrorKind = (
	error: unknown,
): Exclude<McpTransportErrorKind, 'invalid-payload' | 'tool-error'> => {
	const haystack = [
		textFromUnknown(error),
		textFromUnknown(
			typeof error === 'object' && error !== null
				? (error as Record<string, unknown>).cause
				: undefined,
		),
	]
		.filter((entry): entry is string => entry !== undefined)
		.join(' ')
		.toLowerCase();

	if (
		/(abort|aborted|cancel(?:led)?|cancellation|sigint|sigterm)/u.test(
			haystack,
		)
	) {
		return 'cancellation';
	}
	if (
		/(time[ -]?out|timed out|deadline exceeded|etimedout)/u.test(haystack)
	) {
		return 'timeout';
	}
	if (
		/(server exit|server exited|child process.*exit|closed unexpectedly|broken pipe|econnreset|epipe|eof|end of file)/u.test(
			haystack,
		)
	) {
		return 'server-exit';
	}
	return 'protocol';
};

const describeTransportError = (context: string, error: unknown): string => {
	const detail = textFromUnknown(error);
	return detail === undefined || detail.length === 0
		? context
		: `${context}: ${detail}`;
};

const normalizeTransportError = (
	error: unknown,
	context: string,
): McpTransportError => {
	if (error instanceof McpTransportError) return error;
	if (isMcpTransportError(error)) {
		return new McpTransportError(
			error.kind,
			describeTransportError(context, error),
			error.cause ?? error,
		);
	}
	return new McpTransportError(
		classifyTransportErrorKind(error),
		describeTransportError(context, error),
		error,
	);
};

/**
 * Best-effort extraction of a `logHint` from an `isError` result. The
 * server may put it on the MCP `_meta` channel (not schema-validated),
 * on `structuredContent`, or only inside the JSON `content[0].text`
 * envelope; we check all three and validate the shape so a malformed
 * hint never produces a half-populated affordance.
 */
export const logHintFromResult = (result: {
	readonly structuredContent?: unknown;
	readonly content?: Array<{ readonly text?: string }>;
	readonly _meta?: unknown;
}): IMcpLogHint | undefined => {
	const fromMeta = (result._meta as Record<string, unknown> | undefined)
		?.logHint;
	if (isLogHint(fromMeta)) return fromMeta;

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
	private operationTail: Promise<void> = Promise.resolve();
	private closePromise: Promise<void> | undefined;

	private constructor(private readonly transport: IMcpTransport) {}

	static fromTransport(transport: IMcpTransport): McpStdioClient {
		return new McpStdioClient(transport);
	}

	static async connect(
		options: IMcpStdioClientOptions,
	): Promise<McpStdioClient> {
		const client = new sdkBindings.ClientCtor(
			{
				name: MCP_VERTEX_CLIENT_NAME,
				version: MCP_VERTEX_CLIENT_VERSION,
			},
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
			stderr:
				options.onStderr === undefined
					? (options.stderr ?? 'inherit')
					: 'pipe',
		};
		const transport = new sdkBindings.StdioClientTransportCtor(
			transportOptions,
		);
		if (options.onStderr !== undefined) {
			transport.stderr?.on('data', (chunk: Buffer | string) => {
				options.onStderr?.(String(chunk));
			});
		}
		try {
			await client.connect(transport);
		} catch (error) {
			await transport.close().catch(() => undefined);
			throw normalizeTransportError(
				error,
				'Failed to connect to MCP server',
			);
		}
		return new McpStdioClient(client as unknown as IMcpTransport);
	}

	async request<TIn extends object, TOut>(
		tool: string,
		args: TIn,
	): Promise<TOut>;

	async request<TIn extends object, TOut>(
		tool: string,
		args: TIn,
		outputSchema: ZodType<TOut>,
	): Promise<TOut>;

	async request<TIn extends object, TOut>(
		tool: string,
		args: TIn,
		outputSchema?: ZodType<TOut>,
	): Promise<TOut> {
		return this.enqueue(async () => {
			let result: IMcpToolCallResult;
			try {
				result = await this.transport.callTool({
					name: tool,
					arguments: args,
				});
			} catch (error) {
				throw normalizeTransportError(
					error,
					`Failed to call MCP tool "${tool}"`,
				);
			}
			if (result.isError) {
				throw new McpToolError(
					`MCP tool "${tool}" returned an error`,
					result,
					logHintFromResult(result),
				);
			}
			return parsePayloadFromResult(result, outputSchema);
		});
	}

	async listTools(): Promise<readonly IMcpToolDescriptor[]> {
		return this.enqueue(async () => {
			const listed = await this.transport.listTools?.();
			return listed?.tools ?? [];
		});
	}

	async close(): Promise<void> {
		this.closePromise ??= this.operationTail.then(
			() => this.transport.close?.(),
			() => this.transport.close?.(),
		);
		await this.closePromise;
	}

	private enqueue<T>(operation: () => Promise<T>): Promise<T> {
		const next = this.operationTail.then(operation, operation);
		this.operationTail = next.then(
			() => undefined,
			() => undefined,
		);
		return next;
	}
}

const extractPayloadFromResult = (result: {
	readonly structuredContent?: unknown;
	readonly content?: Array<{ readonly text?: string }>;
}): unknown => {
	if (result.structuredContent !== undefined) {
		return result.structuredContent;
	}

	const text = result.content?.find(
		(entry) => entry.text !== undefined,
	)?.text;
	if (text === undefined) {
		throw new McpTransportError(
			'protocol',
			'MCP tool returned no structured or text payload',
			result,
		);
	}

	try {
		return JSON.parse(text) as unknown;
	} catch {
		return text;
	}
};

const parsePayloadFromResult = <TOut>(
	result: {
		readonly structuredContent?: unknown;
		readonly content?: Array<{ readonly text?: string }>;
	},
	outputSchema?: ZodType<TOut>,
): TOut => {
	const payload = extractPayloadFromResult(result);
	if (outputSchema === undefined) {
		return payload as TOut;
	}
	const parsed = outputSchema.safeParse(payload);
	if (parsed.success) {
		return parsed.data;
	}
	throw new McpTransportError(
		'invalid-payload',
		'MCP tool returned a payload that does not match the provided schema',
		parsed.error,
	);
};

export const payloadFromResult = <TOut>(result: {
	readonly structuredContent?: unknown;
	readonly content?: Array<{ readonly text?: string }>;
}): TOut => extractPayloadFromResult(result) as TOut;
