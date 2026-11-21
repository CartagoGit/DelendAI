/** Who delivered a slice Git cannot name, and on whose word. */
export interface IAttestation {
	/** Who delivered the slice. */
	readonly implementer: string;
	/** Who vouches for it. */
	readonly attestedBy: string;
	/** Where the name comes from. */
	readonly evidence: string;
	/**
	 * The Git author (name and email) of the commit that delivered the
	 * slice, when it is known: what Git already says, and so never what
	 * an attestation adds.
	 */
	readonly deliveredBy?: readonly string[] | undefined;
}
