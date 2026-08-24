import packageMetadata from '../../package.json';

import { afterEach, describe, expect, it, vi } from 'vitest';

describe('McpStdioClient.connect', async () => {
	afterEach(() => {
		vi.resetModules();
		vi.restoreAllMocks();
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
			constructor(_: unknown) {}

			async close(): Promise<void> {}
		}

		vi.doMock('@modelcontextprotocol/sdk/client/index.js', () => ({
			Client: FakeClient,
		}));
		vi.doMock('@modelcontextprotocol/sdk/client/stdio.js', () => ({
			StdioClientTransport: FakeTransport,
		}));

		const { McpStdioClient } = await import(
			'../../src/lib/transport/mcp-stdio-client'
		);

		await McpStdioClient.connect({ command: 'bun', stderr: 'ignore' });

		expect(announcedClient).toEqual({
			name: packageMetadata.name,
			version: packageMetadata.version,
		});
	});
});
