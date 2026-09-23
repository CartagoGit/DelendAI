/**
 * tool-request.service.ts — reach a tool the way the surface says to.
 *
 * ## What was broken
 *
 * `delendai search findMeHere` answered `MCP tool
 * "delendai_search_search" returned an error`, in a consumer project and
 * in this repository alike. The cause, which the message dropped:
 *
 *     MCP error -32602: Tool delendai_search_search not found
 *
 * The tool is registered — the catalog lists it with `pluginId: search` —
 * but the managed surface keeps plugin tools HIDDEN until something
 * activates them, so `tools/call` cannot see it. Asked through the
 * router's resolver instead, the same call succeeds and scans 5,542
 * files.
 *
 * So the CLI was reaching past the surface that decides what is
 * reachable, and every command whose tool is hidden failed the same way.
 *
 * ## The shape of the fix
 *
 * The CLI asks for a capability; the router decides how to reach it. The
 * direct call stays first — a visible tool costs one round trip — and a
 * `not found` is not an error to report but a statement that this tool
 * lives behind the resolver, which is exactly what the resolver is for.
 */
import type { ICliCommandContext } from '../../contracts/interfaces/cli-command.interface';
import type { IResolvedCapability } from '../../contracts/interfaces/tool-request.interface';

export type { IResolvedCapability } from '../../contracts/interfaces/tool-request.interface';

/**
 * The surface's way of saying "I will not call that one directly".
 *
 * It has two spellings and they mean the same thing operationally:
 * `not found` for a tool the managed surface hides, and `disabled` for
 * one it has switched off on this surface. Both were measured against the
 * live server: the resolver runs each of them without complaint, so
 * treating only the first as retryable left `metrics` and `scaffold`
 * broken while `search` worked.
 *
 * A bad argument shares the -32602 code and is NOT this: retrying that
 * through the resolver would hide a caller's mistake behind a second
 * failure.
 */
export const isUnexposedHere = (error: unknown): boolean => {
	const said = JSON.stringify(
		(error as { readonly result?: unknown }).result ?? '',
	);
	if (!/-32602/u.test(said)) return false;
	if (/unknown (argument|parameter)|invalid params/iu.test(said)) {
		return false;
	}
	return /\bnot found\b/iu.test(said) || /\bdisabled\b/iu.test(said);
};

/** The router tool every surface exposes, whatever its namespace. */
const RESOLVER_SUFFIX = '_resolve_capability';

/**
 * The namespace the SERVER actually uses, read from its own surface.
 *
 * The prefix was derived from the tool name the caller passed, which only
 * works while the caller guesses right. The CLI names tools
 * `delendai_*` in 80 places; the host config documents a
 * `namespacePrefix` — "e.g. `acme` → `acme_*`" — so a project that
 * renames its namespace has a server whose tools no caller can name.
 *
 * The surface knows, and says so: the router's own tools are always
 * exposed, and one of them ends in `_resolve_capability`. Asking it costs
 * one `tools/list` per context and replaces eighty statements of the same
 * fact with a question to the only thing that can answer it.
 */
const prefixCache = new WeakMap<object, string>();

/**
 * Only a discovered prefix is remembered. A `listTools()` that failed, or a
 * surface that did not name a resolver, answers `undefined` for this call
 * and is asked again on the next: one transient failure must not become
 * the context's permanent answer that every hidden tool is unreachable.
 */
export const serverPrefix = async (
	ctx: Pick<ICliCommandContext, 'listTools'>,
): Promise<string | undefined> => {
	const cached = prefixCache.get(ctx);
	if (cached !== undefined) return cached;
	let exposed: Awaited<ReturnType<typeof ctx.listTools>>;
	try {
		exposed = await ctx.listTools();
	} catch {
		return undefined;
	}
	const prefix = exposed
		.map((tool) => tool.name)
		.find((name) => name.endsWith(RESOLVER_SUFFIX))
		?.slice(0, -RESOLVER_SUFFIX.length);
	if (prefix !== undefined) prefixCache.set(ctx, prefix);
	return prefix;
};

/** The router tool, named as this server names it. */
export const resolverFor = (prefix: string): string =>
	`${prefix}${RESOLVER_SUFFIX}`;

/**
 * The tool a caller asked for, spelled the way this server spells it.
 *
 * Callers name tools in the canonical form; that name is a LOGICAL
 * identifier, and the leading segment is a namespace the server chooses.
 * Swapping it is what lets one call site work against any namespace.
 */
export const requalify = (tool: string, prefix: string): string => {
	const tail = tool.slice(tool.indexOf('_') + 1);
	return tool.includes('_') ? `${prefix}_${tail}` : `${prefix}_${tool}`;
};

/** What the resolver returned, unwrapped, or a refusal that says why. */
export const unwrapResolved = <TOut>(
	tool: string,
	resolved: IResolvedCapability,
): TOut => {
	if (resolved.status !== 'ok') {
		throw new Error(
			`${tool} could not be resolved (${resolved.reason ?? 'unknown'}): ${
				resolved.detail ?? 'the resolver gave no detail.'
			}`,
		);
	}
	const text = resolved.result?.content?.[0]?.text;
	if (text === undefined) {
		throw new Error(
			`${tool} resolved but returned no payload the CLI can read.`,
		);
	}
	try {
		return JSON.parse(text) as TOut;
	} catch {
		// A tool may answer prose. Hand it back rather than pretending it
		// was JSON — the caller asked for this tool and knows its shape.
		return text as TOut;
	}
};
