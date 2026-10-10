/**
 * Operator evidence persisted by the core under the resolved cache root.
 * Evidence is deliberately separate from generated repository documentation:
 * it is session data, not a source artifact to commit.
 */

export type EvidenceType =
	| 'startup-report'
	| 'surface'
	| 'skills'
	| 'verification'
	| 'diagnostic';

export interface IEvidenceStore {
	/** Absolute `<cacheDir>/evidence` root. */
	readonly rootDir: string;
	/** Create the root and the known type directories. */
	ensureLayout(): Promise<void>;
	/** Persist one caller-sanitised, JSON-serialisable evidence envelope. */
	write(
		type: EvidenceType,
		payload: unknown,
		options?: {
			readonly recordedAt?: Date | undefined;
			readonly fileName?: string | undefined;
		},
	): Promise<string>;
}
