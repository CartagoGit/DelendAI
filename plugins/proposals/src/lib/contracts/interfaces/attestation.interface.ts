/** Who delivered a slice Git cannot name, and on whose word. */
export interface IAttestation {
	/** Who delivered the slice. */
	readonly implementer: string;
	/** Who vouches for it. */
	readonly attestedBy: string;
	/** Where the name comes from. */
	readonly evidence: string;
}
