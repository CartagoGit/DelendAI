/**
 * host-sampling.interface.ts — what the host-sampling invoker needs of the
 * host it runs in.
 */

/** What the host answered a sampling request with. */
export interface IHostSamplingReply {
	readonly model: string;
	readonly text: string;
	readonly stopReason?: string | undefined;
}

/** Asks the host to run `model` on `prompt`; absent when the host offers no sampling. */
export type IHostSampler = (input: {
	readonly model: string;
	readonly prompt: string;
	readonly maxTokens: number;
	readonly signal: AbortSignal;
}) => Promise<IHostSamplingReply>;

export interface IHostSamplingInvokerOptions {
	/** The sampler of the host this server runs in, once it is connected; `undefined` outside one. */
	readonly sampler: () => IHostSampler | undefined;
	/** The most a reply may be, in tokens. */
	readonly maxTokens?: number | undefined;
}
