/**
 * bind-write-root.ts — a declared `writeRoot` decides where the tool acts.
 *
 * `writeRoot: 'caller-checkout'` says the tool's writes land in the
 * caller's working tree. Until this module, only the proposals tools
 * made that true, each by declaring a `checkout` argument and resolving
 * it by hand; every other tool that declared the root still ran in the
 * server's root, so the declaration was metadata a reviewer could read
 * and nothing enforced.
 *
 * Binding happens once per registration, where every plugin's tools pass
 * on their way to the server (eager and lazy alike):
 *
 * - the tool's input gains the one shared `checkout` argument, unless it
 *   already declares its own;
 * - each call resolves that argument with `resolveWriteRoot`, the same
 *   check the proposals tools use — a working tree of this repository,
 *   or the server's root when omitted — and runs the handler inside
 *   `runInExecutionRoot`, which is what runners read when they spawn;
 * - a checkout that is not a working tree of this repository is refused
 *   before the handler runs — always, including for a tool that declared
 *   `checkout` itself. A schema field is not proof that the handler
 *   validates it, so authorisation is never delegated to the tool.
 *
 * A tool declared `caller-checkout` whose input cannot carry `checkout`
 * — no input schema, or one that is not an object — fails to register:
 * no call to it could name a checkout, so the declaration would be false.
 */
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import { CHECKOUT_ARG_SCHEMA } from '../contracts/constants/checkout-arg.constant';
import type { IToolRegistration } from '../contracts/interfaces/tool-registration.interface';
import { runInExecutionRoot } from './execution-root';
import { resolveWriteRoot } from './shared-checkout';
import { toolError } from './tool-response';

type IHandler = (...args: unknown[]) => unknown;

interface IObjectSchema {
	readonly shape: Record<string, unknown>;
	extend(shape: Record<string, unknown>): unknown;
}

const isObjectSchema = (schema: unknown): schema is IObjectSchema =>
	typeof schema === 'object' &&
	schema !== null &&
	typeof (schema as { extend?: unknown }).extend === 'function' &&
	typeof (schema as { shape?: unknown }).shape === 'object';

/**
 * The schema with a `checkout` argument, and whether the tool had
 * declared one itself. `undefined` when the schema is not an object this
 * can extend — a raw shape is extended as a plain object.
 */
const withCheckoutArg = (
	schema: unknown,
): { readonly schema: unknown } | undefined => {
	if (isObjectSchema(schema)) {
		if ('checkout' in schema.shape) return { schema };
		return {
			schema: schema.extend({ checkout: CHECKOUT_ARG_SCHEMA.optional() }),
		};
	}
	if (typeof schema === 'object' && schema !== null) {
		if ('checkout' in schema) return { schema };
		return {
			schema: { ...schema, checkout: CHECKOUT_ARG_SCHEMA.optional() },
		};
	}
	return undefined;
};

const boundHandler =
	(
		handler: IHandler,
		serverRoot: string,
		checkoutOf: ((from: string) => string | undefined) | undefined,
	): IHandler =>
	(...callArgs) => {
		const requested = (callArgs[0] as { checkout?: unknown } | undefined)
			?.checkout;
		const resolved = resolveWriteRoot({
			root: 'caller-checkout',
			serverRoot,
			requested: typeof requested === 'string' ? requested : undefined,
			...(checkoutOf !== undefined ? { checkoutOf } : {}),
		});
		if (resolved.ok) {
			return runInExecutionRoot(resolved.root, () =>
				handler(...callArgs),
			);
		}
		return toolError(
			resolved.refusal,
			'Pass the absolute path of your own working tree of this repository, or omit checkout to act in the server’s root.',
		);
	};

/**
 * `registration`, with each of its tools acting in the checkout the call
 * names. Only `caller-checkout` tools are bound: the other roots are
 * fixed by definition and do not move with the caller.
 */
export const bindWriteRoot = (
	registration: IToolRegistration,
	serverRoot: string,
	/** Injectable for tests; defaults to the real `sharedCheckout`. */
	checkoutOf?: (from: string) => string | undefined,
): IToolRegistration => {
	if (registration.writeRoot !== 'caller-checkout') return registration;
	return {
		...registration,
		register: (server) => {
			const proxy = Object.create(server) as McpServer;
			proxy.registerTool = ((
				name: string,
				config: { readonly inputSchema?: unknown },
				handler: IHandler,
			) => {
				const extended = withCheckoutArg(config.inputSchema);
				if (extended === undefined) {
					throw new Error(
						`[delendai] tool "${name}" declares writeRoot 'caller-checkout' but its input cannot carry a \`checkout\` argument (no object input schema), so no call could say which checkout it acts in. Give it an object input schema, or declare the root it actually writes to.`,
					);
				}
				return server.registerTool(
					name,
					{ ...config, inputSchema: extended.schema } as never,
					boundHandler(handler, serverRoot, checkoutOf) as never,
				);
			}) as McpServer['registerTool'];
			return registration.register(proxy);
		},
	};
};
