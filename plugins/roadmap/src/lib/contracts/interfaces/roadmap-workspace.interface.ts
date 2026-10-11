import type z from 'zod';

import type { roadmapOptionsSchema } from '../schemas/roadmap-options.schema';
import type { IRoadmapPromotionPolicy } from './read-model.interface';
import type {
	IRoadmapFilePort,
	IRoadmapStore,
} from './roadmap-store.interface';
import type { IRoadmapTimelineStore } from './timeline.interface';

export type IRoadmapOptions = z.infer<typeof roadmapOptionsSchema>;

/** Whether a workspace-relative path exists; `undefined` when it may not be asked. */
export type IRoadmapPathProbe = (
	relativePath: string,
) => Promise<boolean | undefined>;

/** What opening a project's roadmap needs from its host. */
export interface IRoadmapWorkspaceInput {
	readonly workspaceRoot: string;
	/** The project's docs directory, where its proposals live; absolute. */
	readonly docsDir?: string | undefined;
	readonly options: IRoadmapOptions & { readonly file: string };
	readonly files?: IRoadmapFilePort | undefined;
}

/** A project's roadmap, opened: its stores and how to look the world up. */
export interface IRoadmapWorkspace {
	/** The authority file, relative to the workspace, as declared. */
	readonly file: string;
	readonly roadmap: IRoadmapStore;
	readonly timeline: IRoadmapTimelineStore;
	readonly policy: IRoadmapPromotionPolicy;
	readonly pathExists: IRoadmapPathProbe;
	/** The status of a proposal, by id; `undefined` when none is found. */
	readonly proposalStatus: (id: string) => Promise<string | undefined>;
	/** The version the project's version file names, when it has one. */
	readonly currentVersion: () => Promise<string | undefined>;
}

/** What every roadmap tool is built from. */
export interface IRoadmapToolOptions {
	readonly namespacePrefix: string;
	/**
	 * The roadmap as the current call sees it: an agent working in its
	 * own checkout reads and changes the file there, not the server's.
	 */
	readonly workspace: () => Promise<IRoadmapWorkspace>;
	/** Now, as an ISO timestamp; the timeline owns no clock. */
	readonly now?: () => string;
	/** Who the timeline says made a change, unless the caller names one. */
	readonly actor?: string;
	/** The branches a promotion runs between, from the project's policy. */
	readonly branches?: {
		readonly integration: string;
		readonly release: string;
	};
}
