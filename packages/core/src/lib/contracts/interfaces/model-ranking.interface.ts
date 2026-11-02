/** A provider as the one ranking sees it. */
export interface IRankableModel {
	readonly id: string;
	readonly costTier: number;
	readonly strengths?: readonly string[] | undefined;
	readonly weaknesses?: readonly string[] | undefined;
	/** Whether it can work now (health, account verdict, quota). */
	readonly available: boolean;
	/** Why it cannot, when it cannot. */
	readonly unavailableReason?: string | undefined;
}

/** The task a provider is ranked for. */
export interface IRankTask {
	readonly capabilities?: readonly string[] | undefined;
	readonly mode?: 'plan' | 'review' | 'implement' | 'explore' | undefined;
	/** Narrows the win rates to outcomes of this kind of task. */
	readonly taskKind?: string | undefined;
}

/** A provider's measured win rate, and how many judged outcomes it rests on. */
export interface IModelWinRate {
	readonly winRate: number;
	readonly samples: number;
}

/** One ranked provider: its score and every reason that made it. */
export interface IRankedModel {
	readonly id: string;
	readonly score: number;
	readonly reasons: readonly string[];
	readonly pinned: boolean;
	/** The win rate it was ranked on, or none when there was not enough. */
	readonly evidence?: IModelWinRate | undefined;
}
