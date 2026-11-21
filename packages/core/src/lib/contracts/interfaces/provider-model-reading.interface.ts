/**
 * provider-model-reading.interface.ts — what the provider bridge read.
 */

/** The model a provider observed, or why the bridge names none. */
export type IProviderModelReading =
	| { readonly model: string; readonly provider?: string }
	| {
			readonly reason:
				| 'absent'
				| 'malformed'
				| 'stale'
				| 'other-workspace'
				| 'ambiguous'
				| 'agent-host';
			/** The bridge file that was read. */
			readonly path: string;
			/** How old the freshest entry was, for `stale`. */
			readonly ageMs?: number;
			/** The models fresh entries name, for `ambiguous`. */
			readonly models?: readonly string[];
			/** The variable that marks the agent host, for `agent-host`. */
			readonly marker?: string;
	  };
