/**
 * settlement-runner.interface.ts — the shapes of a settlement run: what
 * it is asked to validate and what it concludes.
 */

export interface ISettlementRunnerOptions {
	readonly cwd: string;
	readonly maxAttempts?: number;
	readonly backoffMs?: (attempt: number) => number;
	readonly validateCommand?: string;
}

export type ISettlementOutcome =
	| {
			readonly green: true;
			readonly headSha: string;
			readonly attempts: number;
	  }
	| {
			readonly green: false;
			readonly attempts: number;
			readonly failingFiles: readonly string[];
			readonly lastError: string;
	  };
