/**
 * record-change.helper.ts — one way a tool changes the roadmap: the
 * authority file first, then whatever the timeline lacks. A timeline that
 * cannot be written does not undo the change: the file is the authority,
 * and `roadmap_sync` shows what is left to record.
 */
import type {
	IRoadmap,
	IRoadmapResult,
} from '../../contracts/interfaces/roadmap.interface';
import type { IRoadmapMutation } from '../../contracts/interfaces/roadmap-store.interface';
import type { IRoadmapToolOptions } from '../../contracts/interfaces/roadmap-workspace.interface';
import { pendingTimelineDrafts } from '../../read-model/roadmap-sync.service';

/** Who the timeline names when neither the caller nor the host does. */
const DEFAULT_ACTOR = 'agent';

export const recordChange = async (
	options: IRoadmapToolOptions,
	mutation: IRoadmapMutation,
	reason: string,
	actor?: string,
): Promise<
	IRoadmapResult<{ readonly roadmap: IRoadmap; readonly recorded: number }>
> => {
	const workspace = await options.workspace();
	const changed = await workspace.roadmap.update(mutation);
	if (!changed.ok) return changed;
	const events = await workspace.timeline.list();
	if (!events.ok)
		return { ok: true, value: { roadmap: changed.value, recorded: 0 } };
	const drafts = pendingTimelineDrafts(changed.value, events.value, {
		actor: actor ?? options.actor ?? DEFAULT_ACTOR,
		at: (options.now ?? (() => new Date().toISOString()))(),
		reason,
	});
	if (!drafts.ok)
		return { ok: true, value: { roadmap: changed.value, recorded: 0 } };
	const appended = await workspace.timeline.append(drafts.value);
	return {
		ok: true,
		value: {
			roadmap: changed.value,
			recorded: appended.ok ? appended.value.length : 0,
		},
	};
};
