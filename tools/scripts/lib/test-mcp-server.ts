/**
 * test-mcp-server.ts — Solid DRY + DIP for the MCP-server stub.
 *
 * Three call sites used to inline the same ~25-line fake-server
 * scaffold (a stub that captures `inputSchema`, `outputSchema`, and
 * `invoke` from `IToolRegistration.register(...)`):
 *
 *   - `tools/scripts/verify/plugin-tool-verify.script.ts`
 *     (`captureSchemas`)
 *   - `tools/scripts/types/generate-tool-types.script.ts`
 *     (the `import`/`readFile` deps, slightly different shape)
 *   - the core test specs (`core-meta-tools.spec.ts`,
 *     `metrics/metrics.spec.ts`, `bootstrap/drift-tool.spec.ts`)
 *     — each defines its own `registerTool` mock.
 *
 * Centralising the fake server:
 *
 *   - **DRY**: one implementation, many callers. Editing the
 *     captured-shape contract (e.g. adding a new schema field)
 *     becomes a single-file change.
 *   - **DIP**: every caller depends on the
 *     `ICapturedToolRegistration` interface, not on the underlying
 *     fake. Tests inject custom fakes for edge cases.
 *   - **Testability**: the helper is itself testable — the
 *     `test-mcp-server.spec.ts` pins the contract.
 */
import type { z } from 'zod';

import type { IToolRegistration } from '@mcp-vertex/core/public';

/**
 * Solid-ISP: the narrowest shape a test needs after capturing a
 * tool. Holds the registration, both schemas, and a typed
 * `invoke(args)` that always returns the parsed JSON payload the
 * MCP handler would have produced (so tests never have to parse
 * `text` themselves).
 */
export interface ICapturedToolRegistration {
	readonly tool: IToolRegistration;
	readonly inputSchema: z.ZodTypeAny | undefined;
	readonly outputSchema: z.ZodTypeAny | undefined;
	/**
	 * Run the captured handler with `args` and return its JSON-parsed
	 * payload (or the raw text when the handler returned plain text).
	 */
	readonly invoke: (args: unknown) => Promise<unknown>;
}

/**
 * Run `tool.register(fakeServer)` and return the captured schemas
 * + handler. Throws if the tool never registered a handler.
 *
 * The fake server satisfies the subset of the MCP server interface
 * that `registerTool` reads: `registerTool(name, schema, handler)`.
 * Cast to `never` because the real interface has more fields and
 * we don't care about them.
 */
export const captureToolRegistration = async (
	tool: IToolRegistration,
): Promise<ICapturedToolRegistration> => {
	let inputSchema: z.ZodTypeAny | undefined;
	let outputSchema: z.ZodTypeAny | undefined;
	let invoke: ((args: unknown) => Promise<unknown>) | undefined;
	const fakeServer = {
		registerTool: (
			_name: string,
			schema: {
				inputSchema?: z.ZodTypeAny;
				outputSchema?: z.ZodTypeAny;
			},
			handler: (a: unknown) => Promise<unknown>,
		) => {
			inputSchema = schema.inputSchema;
			outputSchema = schema.outputSchema;
			invoke = handler;
		},
	};
	await tool.register(fakeServer as never);
	if (!invoke) {
		throw new Error(`tool ${tool.id} did not register a handler`);
	}
	return {
		tool,
		inputSchema,
		outputSchema,
		invoke: async (a: unknown) => {
			const out = (await invoke(a)) as {
				content?: Array<{ text?: string }>;
			};
			const text = out?.content?.[0]?.text;
			if (text === undefined) return out;
			try {
				return JSON.parse(text);
			} catch {
				return text;
			}
		},
	};
};
