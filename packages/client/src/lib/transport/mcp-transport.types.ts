export interface IMcpToolCallResult {
	readonly content?: Array<{
		readonly type?: string;
		readonly text?: string;
	}>;
	readonly isError?: boolean;
	readonly structuredContent?: unknown;
}

export interface IMcpToolDescriptor {
	readonly name: string;
	readonly description?: string;
	readonly inputSchema?: unknown;
	readonly outputSchema?: unknown;
}

export interface IMcpTransport {
	callTool(input: {
		readonly name: string;
		readonly arguments?: object;
	}): Promise<IMcpToolCallResult>;
	listTools?(): Promise<{ readonly tools: readonly IMcpToolDescriptor[] }>;
	close?(): Promise<void>;
}

export interface IMcpStdioClientOptions {
	readonly command: string;
	readonly args?: readonly string[];
	readonly env?: Record<string, string>;
	readonly cwd?: string;
}
