/** How the CLI reaches the server it spawns. */

import type { McpStdioClient } from '@delendai/client/public';

/**
 * How the server is reached.
 *
 * Injected so the refusals before the spawn — the ones a person actually
 * hits when they mistype `--remote` — can be asserted without starting a
 * process.
 */
export type IConnectToServer = (
	options: Parameters<typeof McpStdioClient.connect>[0],
) => Promise<
	Pick<
		Awaited<ReturnType<typeof McpStdioClient.connect>>,
		'request' | 'listTools' | 'close'
	>
>;
