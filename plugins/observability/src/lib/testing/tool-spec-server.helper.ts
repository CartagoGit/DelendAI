/**
 * tool-spec-server.ts — the one server double this plugin's tool specs
 * register against.
 *
 * Each `*.tool.spec.ts` used to carry its own byte-identical `FakeServer`
 * plus JSON-envelope reader. Four copies of the same twelve lines is the
 * duplication the SOLID gate exists to catch, and it made every spec pay
 * for a change to the tool-result envelope.
 *
 * `asServer` is built via `@delendai/test-kit`'s `createFakeToolServer`
 * instead of the previous `server as never` at every `.register()` call
 * site — `as never` was the same escape hatch as `as unknown as T`
 * (assigning the bottom type satisfies any parameter), just spelled
 * differently, and it was never audited as such. `createFakeToolServer`
 * centralises that one unavoidable boundary cast (see its module doc for
 * why `McpServer.registerTool`'s generic signature makes it unavoidable)
 * in one place shared by every plugin, instead of 17 local casts here.
 */
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import { createFakeToolServer } from '@delendai/test-kit/public';

// Not exported: no spec imports this alias by name (they call the handler
// through `FakeServer#tools`), so keeping it module-private avoids adding
// a new contracts/-eligible export for a test-only helper type.
type TToolHandler = (args: unknown) => Promise<unknown>;

/**
 * Captures `registerTool` calls so a spec can invoke a tool handler
 * directly, without standing up a transport. Pass `.asServer` to a real
 * `registration.register(...)` call — never the `FakeServer` instance
 * itself, which is not `McpServer`-shaped.
 */
export class FakeServer {
	readonly tools: Record<string, { handler: TToolHandler }> = {};
	readonly asServer: McpServer = createFakeToolServer({
		onRegisterTool: (call) => {
			this.tools[call.name] = {
				handler: call.handler as TToolHandler,
			};
		},
	});
}

/**
 * Validated rather than cast: a malformed envelope should fail the spec
 * where it is read, not surface later as a confusing assertion error.
 */
const ToolTextResultSchema = z.object({
	content: z.array(z.object({ text: z.string() })).min(1),
});

/** Parse the JSON payload a tool returned in its first text block. */
export const parseOk = (value: unknown): Record<string, unknown> => {
	const parsed = ToolTextResultSchema.safeParse(value);
	const text = parsed.success ? (parsed.data.content[0]?.text ?? '{}') : '{}';
	return JSON.parse(text) as Record<string, unknown>;
};
