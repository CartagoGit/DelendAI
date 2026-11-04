/** The conclusion of the integration branch's latest finished certification. */
export type ICertificationLookup = (
	integration: string,
	root: string,
) => Promise<string | undefined>;

/** Runs `gh` in a directory and returns its stdout; throws when it fails. */
export type IForgeCommandRunner = (
	args: readonly string[],
	cwd: string,
) => string;

export interface IUrgentTurnRequest {
	readonly root: string;
	readonly args: readonly string[];
	readonly proposal: string | undefined;
	readonly integration: string;
	/** Override for specs: the certification's conclusion. */
	readonly certification?: ICertificationLookup;
	/** Override for specs: the command runner the default lookup uses. */
	readonly runForge?: IForgeCommandRunner;
	/** Where the lane says why it could not decide; stderr by default. */
	readonly log?: (line: string) => void;
}
