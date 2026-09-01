/**
 * Public surface of `@mcp-vertex/test-kit`. Test-only helpers shared
 * across every workspace's `*.spec.ts` / `*.test.ts` files.
 */
export { fakePartial } from '../lib/fake-partial.helper';
export type { IFakePartialInput } from '../contracts/interfaces/fake-partial.interface';
export { createFakeToolServer } from '../lib/fake-tool-server.helper';
export { asArray } from '../lib/as-array.helper';
export type {
	IFakeLoggingMessage,
	IFakeRegisteredTool,
	IFakeToolServerOverrides,
} from '../contracts/interfaces/fake-tool-server.interface';
