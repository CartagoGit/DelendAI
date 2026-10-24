import type { IRoadmapReadinessStatus } from './read-model.interface';

/**
 * What is known when a promotion's turn comes round. Each part may be
 * `undefined`: nobody could say — which holds the promotion as surely as
 * a failure does, and is reported as what it is.
 */
export interface IPromotionEvidence {
	/** The conclusion of each check the integration branch requires, on its head. */
	readonly checks: readonly {
		readonly name: string;
		readonly conclusion: string | undefined;
	}[];
	/**
	 * Open code scanning alerts on the integration branch; `null` when the
	 * project has no code scanning, so there is nothing to report.
	 */
	readonly openAlerts: number | null | undefined;
	/** The roadmap's verdict on the next version; absent when no version is pending. */
	readonly roadmap:
		| {
				readonly version: string;
				readonly status: IRoadmapReadinessStatus;
				readonly reason: string;
		  }
		| undefined;
}

export interface IPromotionReadiness {
	readonly ready: boolean;
	/** The version the promotion would carry, when the roadmap names one. */
	readonly version: string | undefined;
	/** Every condition that held it back, in words; empty when ready. */
	readonly heldBackBy: readonly string[];
	/** What was found in its favour, for the pull request's body. */
	readonly evidence: readonly string[];
}
