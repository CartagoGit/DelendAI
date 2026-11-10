export interface IGhStep {
	readonly started_at: string | null;
	readonly completed_at: string | null;
}

export interface IGhJob {
	readonly name: string;
	readonly steps: readonly IGhStep[];
}

export interface IJobCost {
	readonly name: string;
	readonly startMs: number;
	readonly endMs: number;
	readonly seconds: number;
}

export interface IPrCiCost {
	readonly jobs: number;
	readonly runnerSeconds: number;
	readonly wallSeconds: number;
	readonly slowest: readonly IJobCost[];
}
