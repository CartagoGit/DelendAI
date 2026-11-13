import type { IBumpKind } from '@delendai/changelog/public';

import type { ROADMAP_BUMP_AUTHORITY } from '../constants/bump-intent.constant';
import type { IRoadmapBumpHint } from './roadmap.interface';

/** The bump a horizon's promised entries imply, and whom to ask for the real one. */
export interface IRoadmapBumpIntent {
	readonly kind: IBumpKind;
	readonly reason: string;
	/** How many promised entries were considered. */
	readonly considered: number;
	readonly authority: typeof ROADMAP_BUMP_AUTHORITY;
	/** The bump the horizon declares, when it declares one. */
	readonly declared?: IRoadmapBumpHint | undefined;
	/** False when the declared hint and the implied bump differ. */
	readonly coherent: boolean;
}
