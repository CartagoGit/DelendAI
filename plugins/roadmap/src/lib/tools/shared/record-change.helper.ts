/**
 * record-change.helper.ts — one way a tool changes the roadmap: the
 * authority file first, then whatever the timeline lacks. A timeline that
 * cannot be read or written undoes the change: the file goes back to what
 * it was and the caller is told nothing was written, so the file never
 * claims a change the chronology does not hold.
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
	let before: IRoadmap | undefined;
	const changed = await workspace.roadmap.update((roadmap) => {
		before = roadmap;
		return mutation(roadmap);
	});
	if (!changed.ok) return changed;
	const rollBack = async (why: string): Promise<IRoadmapResult<never>> => {
		const restored =
			before === undefined
				? undefined
				: await workspace.roadmap.update(() => ({
						ok: true,
						value: before as IRoadmap,
					}));
		return {
			ok: false,
			reason:
				restored?.ok === true
					? `the timeline could not record the change (${why}); the roadmap file was restored`
					: `the timeline could not record the change (${why}) and the roadmap file could not be restored`,
		};
	};
	const events = await workspace.timeline.list();
	if (!events.ok) return rollBack(events.reason);
	const drafts = pendingTimelineDrafts(changed.value, events.value, {
		actor: actor ?? options.actor ?? DEFAULT_ACTOR,
		at: (options.now ?? (() => new Date().toISOString()))(),
		reason,
	});
	if (!drafts.ok) return rollBack(drafts.reason);
	const appended = await workspace.timeline.append(drafts.value);
	if (!appended.ok) return rollBack(appended.reason);
	return {
		ok: true,
		value: { roadmap: changed.value, recorded: appended.value.length },
	};
};
