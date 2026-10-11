/**
 * roadmap-projection.lib.ts — what a project's roadmap projects to, and
 * whether the committed copies still say the same.
 *
 * The authority is the roadmap file the project declares in its
 * configuration. Two things are derived from it and regenerated, never
 * edited: the JSON a page reads, and the timeline (which records what the
 * file says that it has not recorded yet). A project that declares no
 * roadmap projects to an empty one, so its page has nothing to show and
 * its guard nothing to fail.
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import {
	displayProjection,
	EMPTY_ROADMAP,
	type IRoadmapTimelineDraft,
	type IRoadmapWorkspace,
	openRoadmapWorkspace,
	pendingTimelineDrafts,
	renderDisplayProjection,
	roadmapOptionsSchema,
} from '@delendai/roadmap/public';

/** Where the projection is committed, relative to the repository. */
export const ROADMAP_PROJECTION_PATH = 'apps/web/src/data/roadmaps.json';
/** The project's configuration file. */
const CONFIG_FILE = 'delendai.config.json';
/** Who the timeline says recorded what the generator found in the file. */
export const PROJECTION_ACTOR = 'roadmap-projection';

/** The text of a file, or nothing when it is not there. */
const read = async (path: string): Promise<string | undefined> => {
	try {
		return await readFile(path, 'utf8');
	} catch {
		return undefined;
	}
};

/** The roadmap file a configuration declares, with its options; nothing when it declares none. */
export const declaredRoadmap = (configText: string | undefined) => {
	if (configText === undefined) return undefined;
	let config: unknown;
	try {
		config = JSON.parse(configText);
	} catch {
		return undefined;
	}
	const options = (
		config as { plugins?: { roadmap?: { options?: unknown } } } | null
	)?.plugins?.roadmap?.options;
	const parsed = roadmapOptionsSchema.safeParse(options ?? {});
	if (!parsed.success || parsed.data.file === undefined) return undefined;
	return { ...parsed.data, file: parsed.data.file };
};

export interface IDerivedRoadmap {
	/** The projection's bytes, as they should be committed. */
	readonly text: string;
	/** What the authority file holds that the timeline has not recorded. */
	readonly pending: readonly IRoadmapTimelineDraft[];
	readonly workspace: IRoadmapWorkspace | undefined;
}

/** Derive both projections for the project at `root`, or say why not. */
export const deriveRoadmap = async (
	root: string,
	now: () => string = () => new Date().toISOString(),
): Promise<
	| { readonly ok: true; readonly value: IDerivedRoadmap }
	| { readonly ok: false; readonly reason: string }
> => {
	const options = declaredRoadmap(await read(join(root, CONFIG_FILE)));
	if (options === undefined) {
		return {
			ok: true,
			value: {
				text: renderDisplayProjection(
					displayProjection(null, EMPTY_ROADMAP),
				),
				pending: [],
				workspace: undefined,
			},
		};
	}
	const workspace = await openRoadmapWorkspace({
		workspaceRoot: root,
		options,
	});
	if (!workspace.ok) return workspace;
	const roadmap = await workspace.value.roadmap.read();
	if (!roadmap.ok) return roadmap;
	const events = await workspace.value.timeline.list();
	if (!events.ok) return events;
	const pending = pendingTimelineDrafts(roadmap.value, events.value, {
		actor: PROJECTION_ACTOR,
		at: now(),
		reason: 'recorded from the authority file',
	});
	if (!pending.ok) return pending;
	return {
		ok: true,
		value: {
			text: renderDisplayProjection(
				displayProjection(options.file, roadmap.value),
			),
			pending: pending.value,
			workspace: workspace.value,
		},
	};
};

/** What differs between the committed projections and the derived ones. */
export const roadmapDrift = async (
	root: string,
): Promise<readonly string[]> => {
	const derived = await deriveRoadmap(root);
	if (!derived.ok)
		return [`the roadmap could not be read: ${derived.reason}`];
	const findings: string[] = [];
	if (
		(await read(join(root, ROADMAP_PROJECTION_PATH))) !== derived.value.text
	) {
		findings.push(
			`${ROADMAP_PROJECTION_PATH} is not what the roadmap file projects to`,
		);
	}
	if (derived.value.pending.length > 0) {
		findings.push(
			`the timeline lacks ${String(derived.value.pending.length)} change(s) the roadmap file holds: ${derived.value.pending
				.map(
					(draft) =>
						`${draft.kind} ${draft.entryId ?? draft.horizon}`,
				)
				.join(', ')}`,
		);
	}
	return findings;
};
