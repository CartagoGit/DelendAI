/**
 * cli-command.helper.ts — single source of truth for the pure-function
 * helpers every CLI surface reuses (groups/*.ts, registry.ts,
 * init/*.ts).
 *
 * Extracted in f00046 follow-up / a00036 follow-up so `data`,
 * `scalarArg`, `hasFlag`, `request`, and the type guard `isRecord`
 * stop being copy-pasted across `git.ts` and `registry.ts`. The thin
 * wrappers in `commands/groups/group-helpers.ts` (`positionalArg`,
 * `listArg`, `numberArg`, `usage`) extend this base set; the group
 * file therefore re-exports both so each consumer keeps a single
 * import site.
 *
 * Why this is a `helper` and not a `service` (f00093):
 *
 *   - These functions have **no state**, no IO, and no business logic.
 *     They are reference-style wrappers and parsers around the
 *     `ICliCommand` contract — exactly what f00093 calls a "helper".
 *   - Inflating them into `.service.ts` misrepresents the role; the
 *     f00037 table documents `.service.ts` as "stateful business
 *     logic", which these do not satisfy.
 *
 * SOLID:
 *   - Single responsibility: argument parsing + result shaping +
 *     type guards for the CLI surface. No domain logic.
 *   - Open/closed: add a new helper here, re-export from
 *     `group-helpers.ts` if a group needs it; the call sites do not
 *     change.
 *   - Interface segregation: every helper is a pure function with a
 *     minimal signature — no shared state, no god-object.
 *   - Dependency inversion: helpers depend on the public contracts
 *     (`ICliCommandContext`, `ICliCommandResult`) — no upward
 *     dependency on the call sites.
 */
import { EXIT_CODE } from '../../contracts/constants/exit-code.constant';
import { isRecord, scalarArg } from '@delendai/core/cli';

export { isRecord, scalarArg };
import type {
	ICliCommandContext,
	ICliCommandResult,
} from '../../contracts/interfaces/cli-command.interface';

/** Wrap a tool payload as a successful (or coded) CLI data result. */
export const data = (
	value: unknown,
	code: ICliCommandResult['code'] = EXIT_CODE.OK,
): ICliCommandResult => ({ code, data: value });

/** True when a boolean `--name` flag is present. */
export const hasFlag = (args: readonly string[], name: string): boolean =>
	args.includes(`--${name}`);

/** Delegate to a registered MCP tool; the client reaches a hidden one. */
export const request = async <TOut>(
	ctx: ICliCommandContext,
	tool: string,
	args: object = {},
): Promise<TOut> => ctx.request<TOut>(tool, args);
