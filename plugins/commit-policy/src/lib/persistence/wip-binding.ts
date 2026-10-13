/**
 * wip-binding.ts — the ONE place this plugin reaches into
 * `@delendai/core`'s WIP ref engine.
 *
 * WHY isolate it: everything else in `persistence/` is written against
 * the narrow `IWipCheckpointPort` interface, so the routing rules, the
 * intent classification and the engine's seam can all be specified
 * without the core engine's module graph, and a host that wants a
 * different WIP implementation can supply one. Confining the concrete
 * dependency to a single small file also means the day core changes its
 * factory signature, exactly one file in this plugin fails to compile.
 *
 * `createWipEngine` returns `undefined` when the path is not inside a
 * git working tree; that is propagated rather than papered over — a
 * caller that cannot persist must learn it here, not halfway through a
 * checkpoint.
 */

import { createWipEngine } from '@delendai/core/public';
import type { IAnchorRequirement } from '@delendai/core/public';

import type { IWipCheckpointPort } from '../contracts/interfaces/persistence.interface';

/** Bind the core WIP engine to `workspaceRoot`, as a narrow port. */
export const bindWipCheckpointPort = async (
	workspaceRoot: string,
	anchor: IAnchorRequirement,
	timeoutMs?: number,
): Promise<IWipCheckpointPort | undefined> => {
	const engine = await createWipEngine(workspaceRoot, anchor, timeoutMs);
	if (engine === undefined) return undefined;
	return { createOrUpdateWipRef: engine.createOrUpdateWipRef };
};
