import type { IResolvedDevelopmentPolicy } from '@delendai/core/public';

/** The unit of work being published, and where its work ref points. */
export interface IPublicationTargetRequest {
	readonly root: string;
	readonly policy: IResolvedDevelopmentPolicy;
	readonly remote: string;
	readonly agent: string;
	readonly proposal: string;
	readonly slice: string;
	readonly generation: number;
	readonly topic?: string | undefined;
	/** The integration commit the work is measured against. */
	readonly base: string;
	readonly workRef: string;
}

/** Where the work is published, and the reason in words. */
export interface IPublicationTarget {
	readonly unit: 'slice' | 'proposal';
	readonly publicationRef: string;
	readonly reason: string;
}
