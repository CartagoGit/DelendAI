/**
 * The next legal step toward `done` for a proposal whose slices are all
 * finished.
 *
 * Lives in `contracts/` because the closure cascade and the transition
 * DFA both depend on this shape, and they must not drift: recommending a
 * hop the DFA rejects is how 128 fully-implemented proposals ended up
 * stranded in `ready/` — `auto_work` kept handing agents a
 * `ready → review` step that `proposal_transition` then refused, and a
 * well-behaved agent looped on it forever.
 */
export interface IClosureHop {
	/** The status to transition to next. Always a legal DFA edge. */
	readonly to: 'in-progress' | 'review' | 'done';
	/** Whether that hop's gate asks for validate evidence. */
	readonly needsValidateEvidence: boolean;
	/** One line telling the caller why this hop and what follows. */
	readonly guide: string;
}
