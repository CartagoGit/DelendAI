/**
 * What a blocked `close_slice` tells the agent to do next.
 *
 * The scoped-validation resolver already decides precisely why a close
 * cannot proceed and records it in `blockingReasons` — corrupt activity
 * evidence, an actor that is not provably active, files outside every
 * configured scope. None of that reached the caller: the envelope kept
 * only `reason`, a single abstract sentence ("close requires a
 * consistent snapshot and an active current actor") that names no file,
 * no actor and no tool. An agent that receives it has nothing to act on,
 * so it guesses — usually by blaming whichever gate it heard about most
 * recently — and stalls with work finished and uncloseable.
 */
export interface ICloseBlockerGuidance {
	/** The resolver's own reasons, verbatim, so nothing is lost. */
	readonly blockingReasons: readonly string[];
	/** The concrete call that addresses them. */
	readonly nextAction: string;
}
