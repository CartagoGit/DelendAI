import packageMetadata from '../../package.json';

import { afterEach, describe, expect, it } from 'vitest';

import {
	__resetMcpSdkBindingsForTests,
	__setMcpSdkBindingsForTests,
	McpStdioClient,
} from '../../src/lib/transport/mcp-stdio-client';

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

		class FakeTransport {
			async close(): Promise<void> {}
		}

		__setMcpSdkBindingsForTests({
			ClientCtor:
				FakeClient as unknown as typeof import('@modelcontextprotocol/sdk/client/index.js').Client,
			StdioClientTransportCtor:
				FakeTransport as unknown as typeof import('@modelcontextprotocol/sdk/client/stdio.js').StdioClientTransport,
		});

		await McpStdioClient.connect({ command: 'bun', stderr: 'ignore' });

		expect(announcedClient).toEqual({
			name: packageMetadata.name,
			version: packageMetadata.version,
		});
	});
});
