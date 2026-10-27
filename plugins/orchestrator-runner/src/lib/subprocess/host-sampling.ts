/**
 * host-sampling.ts — the `host-sampling` invoker: ask the host editor to
 * run one of its own models through MCP sampling.
 *
 * A model the person serves through their editor's BYOK has its key in
 * the editor, so the only route that leaves it there is the editor
 * itself: `sampling/createMessage` with the model as a hint. The editor
 * decides — it may ask the person, refuse, or not offer sampling at all —
 * and each of those is a refusal the caller sees, never a quiet answer
 * from another model.
 */
import type {
	IActiveInvocation,
	IInvokeRequest,
	IInvokeResult,
	IKindInvoker,
} from '../invoke/types';
import type {
	IHostSampler,
	IHostSamplingInvokerOptions,
} from '../contracts/interfaces/host-sampling.interface';

export type {
	IHostSampler,
	IHostSamplingInvokerOptions,
	IHostSamplingReply,
} from '../contracts/interfaces/host-sampling.interface';

/** A reply up to this many tokens unless told otherwise. */
const DEFAULT_MAX_TOKENS = 4096;

/** Whether `served` is the model `asked` named (the host may add its vendor). */
export const servedAsAsked = (asked: string, served: string): boolean =>
	served === asked ||
	served.endsWith(`/${asked}`) ||
	asked.endsWith(`/${served}`);

export const createHostSamplingInvoker = (
	options: IHostSamplingInvokerOptions,
): IKindInvoker => ({
	start(request: IInvokeRequest): IActiveInvocation {
		const controller = new AbortController();
		const run = async (): Promise<IInvokeResult> => {
			if (request.invoke.kind !== 'host-sampling')
				throw new Error(
					`host-sampling invoker got a ${request.invoke.kind} decision`,
				);
			const model = request.invoke.model;
			const sampler = options.sampler();
			if (sampler === undefined)
				throw new Error(
					`host-unavailable: this server runs outside a host that offers sampling, so ${model} cannot be asked for`,
				);
			const reply = await sampler({
				model,
				prompt: request.prompt,
				maxTokens: options.maxTokens ?? DEFAULT_MAX_TOKENS,
				signal: controller.signal,
			});
			if (!servedAsAsked(model, reply.model))
				throw new Error(
					`host-substituted: asked for ${model}, the host answered with ${reply.model}; the reply is not used`,
				);
			return {
				text: reply.text,
				structuredContent: {
					model: reply.model,
					...(reply.stopReason === undefined
						? {}
						: { stopReason: reply.stopReason }),
				},
			};
		};
		return {
			promise: run(),
			cancel: () => controller.abort(),
		};
	},
});
