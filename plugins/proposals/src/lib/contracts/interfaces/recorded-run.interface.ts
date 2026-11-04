/** A run the test journal recorded, as an approval cites it. */
export interface IRecordedRun {
	readonly runId: string;
	readonly result: 'pass' | 'fail';
	readonly command: string;
	readonly passed: number;
	readonly tests: number;
}
