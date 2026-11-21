import packageMetadata from '../../package.json';

import { afterEach, describe, expect, it } from 'vitest';

import {
	__resetMcpSdkBindingsForTests,
	__setMcpSdkBindingsForTests,
	McpStdioClient,
} from '../../src/lib/transport/mcp-stdio-client';

class FakeTransport {
	async close(): Promise<void> {}
}

/** Binds `ClientClass` as the SDK client, and a transport that does nothing. */
const bindClient = (ClientClass: new (info: unknown) => unknown): void => {
	__setMcpSdkBindingsForTests({
		ClientCtor:
			ClientClass as unknown as typeof import('@modelcontextprotocol/sdk/client/index.js').Client,
		StdioClientTransportCtor:
			FakeTransport as unknown as typeof import('@modelcontextprotocol/sdk/client/stdio.js').StdioClientTransport,
	});
};

describe('McpStdioClient.connect', async () => {
	afterEach(() => {
		__resetMcpSdkBindingsForTests();
	});

	it('announces the package version from package metadata', async () => {
		let announcedClient: unknown;

		class FakeClient {
			constructor(clientInfo: unknown) {
				announcedClient = clientInfo;
			}

			async connect(): Promise<void> {}
		}
		bindClient(FakeClient);

		await McpStdioClient.connect({ command: 'bun', stderr: 'ignore' });

		expect(announcedClient).toEqual({
			name: packageMetadata.name,
			version: packageMetadata.version,
		});
	});

	it('gives each tool call the timeout it was connected with, and the SDK default otherwise', async () => {
		// A call given up on at the SDK's one minute was cut off while the
		// server was still committing what it wrote.
		const timeouts: unknown[] = [];

		class FakeClient {
			async connect(): Promise<void> {}

			async callTool(
				_input: unknown,
				_schema: unknown,
				options?: { readonly timeout?: number },
			): Promise<unknown> {
				timeouts.push(options?.timeout);
				return { content: [], structuredContent: { ok: true } };
			}
		}
		bindClient(FakeClient);

		const patient = await McpStdioClient.connect({
			command: 'bun',
			stderr: 'ignore',
			requestTimeoutMs: 1_800_000,
		});
		await patient.request('delendai_status', {});
		const plain = await McpStdioClient.connect({
			command: 'bun',
			stderr: 'ignore',
		});
		await plain.request('delendai_status', {});

		expect(timeouts).toEqual([1_800_000, undefined]);
	});
});
