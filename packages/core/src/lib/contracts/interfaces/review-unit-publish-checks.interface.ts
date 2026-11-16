import type { ISwarmUnit } from './work-swarm.interface';

/** What the checks read: git, the documents folder and the swarm. */
export interface IReviewUnitChecksDeps {
	readonly git: (args: readonly string[]) => string | undefined;
	readonly docsDir: () => Promise<string>;
	readonly swarm: () => {
		readonly units: readonly ISwarmUnit[];
		readonly published: readonly ISwarmUnit[];
	};
}
