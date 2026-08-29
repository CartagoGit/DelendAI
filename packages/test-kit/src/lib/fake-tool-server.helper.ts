/**
 * fake-tool-server.ts — the ONE audited `as unknown as McpServer` cast
 * that replaces the ~15 near-identical copies this repo's tests had
 * (`plugins/completion`, `plugins/quality`, `plugins/proposals`), each
 * hand-rolling its own `{ registerTool: (...) => {...} } as unknown as
 * Parameters<typeof registration.register>[0]`.
 *
 * **Why this is a documented exception to `fakePartial`, not a case
 * `fakePartial` failed to cover:** `McpServer.registerTool` (and
 * `.tool`, `.registerResource`, `.registerPrompt`) are TypeScript
 * GENERIC, overloaded methods (`registerTool<OutputArgs, InputArgs>(...)`
 * with a Zod-schema-shaped `config` parameter whose type depends on the
 * generic instantiation). Verified empirically (see this file's spec):
 * assigning ANY concrete, non-generic function value to a generic
 * method property fails structural assignability — TypeScript checks
 * the fake against a specific instantiation of the generic signature,
 * and a hand-authored fake's parameter types are never simultaneously
 * compatible with every instantiation a generic caller could produce.
 * This is not a gap in `fakePartial`'s design; it is a hard limit of
 * structural typing against generics that no partial-object helper —
 * however written — can close without either (a) making the fake
 * itself generic and reimplementing the SDK's overload set (not worth
 * it for a test double), or (b) a boundary cast.
 *
 * This helper takes (b), but narrows its blast radius the same way
 * `fakePartial` does for the non-generic case: the cast lives in this
 * one file, audited once, and every call site gets a strongly-typed
 * `IFakeToolServerOverrides` — typos in the override keys and wrong
 * handler shapes are still caught by `tsc`, only the final
 * `McpServer` boundary itself is asserted.
 */
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import type { IFakeToolServerOverrides } from '../contracts/interfaces/fake-tool-server.interface';

export const createFakeToolServer = (
	overrides: IFakeToolServerOverrides = {},
): McpServer => {
	const fake = {
		registerTool: (name: string, config: unknown, handler: unknown) => {
			overrides.onRegisterTool?.({
				name,
				config,
				handler: handler as (args: unknown) => unknown,
			});
		},
		sendLoggingMessage: async (message: {
			level: string;
			logger?: string;
			data: unknown;
		}) => {
			await overrides.onSendLoggingMessage?.(message);
		},
	};
	// The one documented boundary cast — see the module doc above for why
	// `fakePartial` cannot close this gap.
	return fake as unknown as McpServer;
};
