/**
 * manager.ts — the invocation brain (f00067 S6).
 *
 * Ties everything together: it plans the fallback chain (CRITICAL I7),
 * enforces the safety default (CRITICAL I5 — no spend without a signed
 * token), runs the per-kind invoker, applies the wall-clock timeout that
 * fires the per-kind cancellation ladder (CRITICAL I8), and registers each
 * in-flight invocation so `<prefix>_cancel_invocation` can reach it.
 *
 * It is pure of I/O beyond the injected invokers/gate/clock, so the whole
 * decision + safety + fallback surface is unit-testable with mock invokers —
 * no real subprocess, no real network, no real spend.
 */
import { randomUUID } from 'node:crypto';

import type {
	IProviderAvailability,
	IProviderCapabilities,
	IRoutingDecision,
	ProviderKind,
	RoutingMode,
} from '@mcp-vertex/core/public';

import type { CapabilityTag } from '@mcp-vertex/core/public';
import { planFallbackChain, type FallbackStrategy } from './fallback';
import {
	ConfirmationSigner,
	denyAllConfirmationGate,
	type IConfirmationGate,
} from './token';
import type {
	CancelReason,
	IActiveInvocation,
	IKindInvoker,
	IInvokeResult,
	ITriedProvider,
} from './types';
import type { CostPreference } from '../types';

export type InvokeErrorCode =
	| 'no-providers'
	| 'all-providers-failed'
	| 'execution-disabled'
	| 'confirmation-required'
	| 'timeout-exceeded'
	| 'cancelled';

export interface IInvokeArgs {
	readonly task: string;
	readonly mode?: RoutingMode;
	readonly capabilityHints?: readonly CapabilityTag[];
	readonly costPreference?: CostPreference;
	readonly sessionId?: string;
	readonly stream?: boolean;
	readonly toolsAllow?: readonly string[];
	readonly timeoutMs?: number;
	readonly fallbackStrategy?: FallbackStrategy;
}

export interface IInvokeOutput {
	readonly decision: IRoutingDecision;
	readonly sessionId: string;
	readonly invocationId?: string;
	readonly result?: IInvokeResult;
	readonly error?: {
		readonly code: InvokeErrorCode;
		readonly tried: readonly ITriedProvider[];
		readonly nextAvailableAt: {
			readonly provider: string;
			readonly resetAt: string;
		} | null;
	};
	readonly userMessage?: string;
}

export interface ITimerHandle {
	clear(): void;
}

export interface IInvocationManagerOptions {
	readonly providers: readonly IProviderCapabilities[];
	readonly availabilityOf: (id: string) => IProviderAvailability;
	readonly invokers: Readonly<Record<ProviderKind, IKindInvoker>>;
	readonly defaultCostPreference: CostPreference;
	readonly invokeTimeoutMs: number;
	readonly maxFallbackDepth: number;
	readonly fallbackStrategy: FallbackStrategy;
	readonly executeApi: boolean;
	readonly confirmBeforeExecute: boolean;
	readonly autoBypassConfirmed: boolean;
	readonly confirmationGate?: IConfirmationGate;
	readonly signer?: ConfirmationSigner;
	/** Records an auto-bypassed spend (S7 wires the real usage-summary sink). */
	readonly recordBypass?: () => void;
	readonly now?: () => Date;
	readonly newInvocationId?: () => string;
	readonly setTimer?: (fn: () => void, ms: number) => ITimerHandle;
}

interface IActiveEntry {
	readonly invocation: IActiveInvocation;
	userCancelled: boolean;
}

const SPEND_KINDS: ReadonlySet<ProviderKind> = new Set<ProviderKind>([
	'api',
	'cli',
]);

const defaultSetTimer = (fn: () => void, ms: number): ITimerHandle => {
	const handle = setTimeout(fn, ms);
	handle.unref?.();
	return { clear: () => clearTimeout(handle) };
};

export class InvocationManager {
	private readonly opts: IInvocationManagerOptions;
	private readonly gate: IConfirmationGate;
	private readonly signer: ConfirmationSigner;
	private readonly now: () => Date;
	private readonly newId: () => string;
	private readonly setTimer: (fn: () => void, ms: number) => ITimerHandle;
	private readonly active = new Map<string, IActiveEntry>();

	constructor(options: IInvocationManagerOptions) {
		this.opts = options;
		this.gate = options.confirmationGate ?? denyAllConfirmationGate;
		this.signer = options.signer ?? new ConfirmationSigner();
		this.now = options.now ?? (() => new Date());
		this.newId = options.newInvocationId ?? (() => `inv_${randomUUID()}`);
		this.setTimer = options.setTimer ?? defaultSetTimer;
	}

	/** Signed-token minter for the host's confirmation gate to call. */
	mintToken(invocationId: string): string {
		return this.signer.mint(invocationId);
	}

	/** Cancel an in-flight invocation with the per-kind ladder (CRITICAL I8). */
	cancel(invocationId: string): { readonly cancelled: boolean } {
		const entry = this.active.get(invocationId);
		if (entry === undefined) return { cancelled: false };
		entry.userCancelled = true;
		entry.invocation.cancel('user-cancel');
		return { cancelled: true };
	}

	private nextAvailableAt(): {
		readonly provider: string;
		readonly resetAt: string;
	} | null {
		let soonest: { provider: string; resetAt: string } | null = null;
		for (const provider of this.opts.providers) {
			const health = this.opts.availabilityOf(provider.id);
			if (health.until === undefined) continue;
			if (soonest === null || health.until < soonest.resetAt) {
				soonest = { provider: provider.id, resetAt: health.until };
			}
		}
		return soonest;
	}

	private async runOne(
		invocationId: string,
		decision: IRoutingDecision,
		args: IInvokeArgs,
		timeoutMs: number,
	): Promise<
		| { readonly ok: true; readonly result: IInvokeResult }
		| {
				readonly ok: false;
				readonly reason: CancelReason | 'error';
				readonly message: string;
		  }
	> {
		const kind = decision.targetProvider.kind;
		const invoker = this.opts.invokers[kind];
		const active = invoker.start({
			invocationId,
			decision,
			invoke: decision.invoke,
			prompt: decision.prompt,
			...(args.toolsAllow !== undefined
				? { toolsAllow: args.toolsAllow }
				: {}),
			...(args.stream !== undefined ? { stream: args.stream } : {}),
		});
		const entry: IActiveEntry = {
			invocation: active,
			userCancelled: false,
		};
		this.active.set(invocationId, entry);

		let timedOut = false;
		const timer = this.setTimer(() => {
			timedOut = true;
			active.cancel('timeout');
		}, timeoutMs);

		try {
			const result = await active.promise;
			return { ok: true, result };
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			if (timedOut) return { ok: false, reason: 'timeout', message };
			if (entry.userCancelled) {
				return { ok: false, reason: 'user-cancel', message };
			}
			return { ok: false, reason: 'error', message };
		} finally {
			timer.clear();
			this.active.delete(invocationId);
		}
	}

	/** Whether a spend is authorised, and whether it was an auto-bypass. */
	private async authoriseSpend(
		invocationId: string,
		decision: IRoutingDecision,
	): Promise<{ readonly ok: boolean; readonly bypassed: boolean }> {
		if (!this.opts.executeApi) return { ok: false, bypassed: false };
		// Auto-bypass only with the explicit per-session opt-in.
		if (!this.opts.confirmBeforeExecute) {
			if (this.opts.autoBypassConfirmed) {
				this.opts.recordBypass?.();
				return { ok: true, bypassed: true };
			}
			return { ok: false, bypassed: false };
		}
		const token = await this.gate.confirm({
			invocationId,
			providerId: decision.targetProvider.id,
			estimatedCostTier: decision.estimatedCostTier,
		});
		if (token === null) return { ok: false, bypassed: false };
		return {
			ok: this.signer.verify(token, invocationId),
			bypassed: false,
		};
	}

	async invoke(args: IInvokeArgs): Promise<IInvokeOutput> {
		const mode: RoutingMode = args.mode ?? 'implement';
		const costPref = args.costPreference ?? this.opts.defaultCostPreference;
		const sessionId = args.sessionId ?? `sess_${randomUUID()}`;
		const strategy: FallbackStrategy =
			args.fallbackStrategy ?? this.opts.fallbackStrategy;
		const invocationId = this.newId();

		const chain = planFallbackChain({
			providers: this.opts.providers,
			availabilityOf: this.opts.availabilityOf,
			hint: { mode, capabilities: args.capabilityHints ?? [], costPref },
			prompt: args.task,
			sessionId,
			strategy,
			maxDepth: this.opts.maxFallbackDepth,
		});

		if (chain.length === 0 || chain[0] === undefined) {
			const empty = this.emptyDecision(args.task, mode, sessionId);
			return {
				decision: empty,
				sessionId,
				error: {
					code: 'no-providers',
					tried: [],
					nextAvailableAt: this.nextAvailableAt(),
				},
				userMessage:
					'No provider is available to run this task. Run bootstrap_providers or healthcheck_providers, or relax the capability hints.',
			};
		}

		const tried: ITriedProvider[] = [];
		let sawSpendBlocked = false;
		const primary = chain[0];

		for (const decision of chain) {
			const kind = decision.targetProvider.kind;
			const timeoutMs = args.timeoutMs ?? this.opts.invokeTimeoutMs;

			if (SPEND_KINDS.has(kind)) {
				const auth = await this.authoriseSpend(invocationId, decision);
				if (!auth.ok) {
					sawSpendBlocked = true;
					if (!this.opts.executeApi) {
						// Safe default: never spend; record + try a non-spend hop.
						tried.push({
							provider: decision.targetProvider.id,
							failure: 'execution-disabled',
							at: this.now().toISOString(),
						});
						continue;
					}
					// executeApi on but the user did not authorise THIS
					// invocation — stop (do not prompt for other providers).
					return {
						decision,
						sessionId,
						error: {
							code: 'confirmation-required',
							tried,
							nextAvailableAt: this.nextAvailableAt(),
						},
						userMessage:
							'Execution requires your confirmation for this specific invocation. Approve the elicitation to mint a one-time token, then retry.',
					};
				}
			}

			const outcome = await this.runOne(
				invocationId,
				decision,
				args,
				timeoutMs,
			);
			if (outcome.ok) {
				return {
					decision,
					sessionId,
					invocationId,
					result: outcome.result,
				};
			}
			if (outcome.reason === 'timeout') {
				return {
					decision,
					sessionId,
					error: {
						code: 'timeout-exceeded',
						tried: [
							...tried,
							{
								provider: decision.targetProvider.id,
								failure: `timeout-exceeded after ${timeoutMs}ms`,
								at: this.now().toISOString(),
							},
						],
						nextAvailableAt: this.nextAvailableAt(),
					},
					userMessage: `The invocation exceeded its ${timeoutMs}ms cap and was cancelled.`,
				};
			}
			if (outcome.reason === 'user-cancel') {
				return {
					decision,
					sessionId,
					error: {
						code: 'cancelled',
						tried,
						nextAvailableAt: this.nextAvailableAt(),
					},
					userMessage: 'The invocation was cancelled.',
				};
			}
			tried.push({
				provider: decision.targetProvider.id,
				failure: outcome.message,
				at: this.now().toISOString(),
			});
		}

		const allBlocked =
			sawSpendBlocked &&
			tried.every((t) => t.failure === 'execution-disabled');
		return {
			decision: primary,
			sessionId,
			error: {
				code: allBlocked
					? 'execution-disabled'
					: 'all-providers-failed',
				tried,
				nextAvailableAt: this.nextAvailableAt(),
			},
			userMessage: allBlocked
				? 'API/CLI execution is disabled (executeApi:false). Use format_handoff to get a ready-to-run command, or enable executeApi to spend.'
				: 'Every candidate provider failed. Inspect `tried` for the per-provider failures, or check quota/healthcheck.',
		};
	}

	private emptyDecision(
		task: string,
		mode: RoutingMode,
		sessionId: string,
	): IRoutingDecision {
		return {
			strategy: 'handoff',
			targetProvider: {
				id: 'none',
				kind: 'cli',
				invoke: { kind: 'cli', command: '' },
				modelId: 'none',
				contextWindow: 0,
				costTier: 1,
				strengths: [],
				weaknesses: [],
			},
			mode,
			prompt: task,
			invoke: { kind: 'cli', command: '' },
			rationale:
				'No provider is available. Run bootstrap_providers to build a roster.',
			estimatedCostTier: 1,
			alternates: [],
			scoringTrace: [],
			sessionId,
		};
	}
}
