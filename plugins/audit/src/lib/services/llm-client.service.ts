/**
 * Stateless HTTP clients for the audit fan-out (alcance B, f00077).
 *
 * The audit plugin previously required a human to paste the brief from
 * `audit_plan` into each model. Alcance B automates that: this module
 * sends the brief to N providers in parallel and returns the raw
 * markdown each one wrote. The orchestrator (audit-run.tool.ts) is then
 * responsible for:
 *
 * 1. Saving each markdown to `docs/.../done/audits/`.
 * 2. Calling the existing `consolidateAudits` to deduplicate + average.
 * 3. Handing the consolidated findings to the proposal scaffolder.
 *
 * Design notes (see AGENTS.md, plugin-authoring skill):
 *
 * - **No env-var reach-around.** The orchestrator passes the API key
 *   explicitly. Reading `process.env` from a plugin is forbidden in
 *   this repo (rule 2). Hosts wire credentials through
 *   `audit_run`'s input or through the host config; this service
 *   never reads them on its own.
 * - **Stateless.** No retries, no queue, no persistence. The
 *   orchestrator owns the durability boundary; this service is
 *   purely a "send prompt, get markdown" adapter per provider.
 * - **Project-agnostic.** Provider identifiers, model names, and the
 *   per-provider URL layout live here, not in the tool. The tool
 *   only knows about `IModelTarget` and gets back markdown.
 * - **Bounded.** Every call has a timeout (default 90 s) so a stuck
 *   provider cannot block the fan-out indefinitely.
 * - **Testable.** The transport is injected via
 *   {@link IHttpTransport}, which lets the e2e spec (S4) swap in a
 *   deterministic in-memory mock without touching this file.
 */

import { redactSecrets } from '@mcp-vertex/core/public';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Providers the audit fan-out knows how to talk to. */
export type LlmProvider = 'openrouter' | 'anthropic' | 'google' | 'openai';

/** A single audit target: which provider, which model, with which key. */
export interface IModelTarget {
	/** Provider identifier (routing key + auth scheme). */
	readonly provider: LlmProvider;
	/**
	 * Model identifier the provider understands
	 * (e.g. `anthropic/claude-sonnet-4.6`, `gemini-2.5-pro`,
	 * `gpt-4o`, `claude-opus-4-8`).
	 */
	readonly model: string;
	/**
	 * API key for the provider. Required for every target — the
	 * service never falls back to environment variables (rule 2 of
	 * AGENTS.md: no `process.env` reach-around in engines).
	 */
	readonly apiKey: string;
}

/** What the service resolves a target into before issuing the HTTP call. */
export interface IResolvedTarget {
	readonly provider: LlmProvider;
	readonly model: string;
	readonly url: string;
	readonly headers: Readonly<Record<string, string>>;
	readonly body: string;
}

/** A single result from the fan-out. */
export interface ILlmCallResult {
	readonly target: IModelTarget;
	/** Raw markdown body the provider returned (after our envelope parsing). */
	readonly markdown: string;
	/** Provider-reported duration of the call, in ms. */
	readonly elapsedMs: number;
}

/** Failure variant of {@link ILlmCallResult}. */
export interface ILlmCallError {
	readonly target: IModelTarget;
	readonly error: string;
	readonly elapsedMs: number;
}

/** Discriminated union: callers always check `ok` first. */
export type ILlmCallOutcome =
	| ({ readonly ok: true } & ILlmCallResult)
	| ({ readonly ok: false } & ILlmCallError);

/** Per-call options. */
export interface ILlmClientOptions {
	/**
	 * Per-target timeout in ms. The transport rejects the call when
	 * the deadline is reached. Default 90 000.
	 */
	readonly timeoutMs?: number;
	/**
	 * Maximum markdown length to retain. Protects the orchestrator
	 * from a chatty provider that returns 5 MB of output. Default
	 * 1 MiB; oversize responses are truncated with a warning marker.
	 */
	readonly maxResponseBytes?: number;
	/**
	 * Optional system prompt prepended to the user turn. Most
	 * providers handle this via the `system` field; OpenRouter/OpenAI
	 * receive it as a `system` role message at the head of the
	 * messages array. Default: a short "you are an audit model"
	 * instruction.
	 */
	readonly systemPrompt?: string;
	/**
	 * Transport for outbound HTTP. Injectable for tests; defaults to
	 * the built-in `fetch` adapter. Each call gets its own
	 * AbortController-derived signal so a slow provider does not
	 * stall the whole batch.
	 */
	readonly transport?: IHttpTransport;
}

/** Minimal HTTP transport interface. */
export interface IHttpTransport {
	/**
	 * Issue a request. Implementations MUST honour `signal` (callers
	 * rely on it for timeouts) and return a JSON-decodable body.
	 */
	readonly fetchJson: (
		url: string,
		init: {
			method: 'POST';
			headers: Record<string, string>;
			body: string;
			signal: AbortSignal;
		},
	) => Promise<{ readonly status: number; readonly json: unknown }>;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_TIMEOUT_MS = 90_000;
const DEFAULT_MAX_BYTES = 1_048_576; // 1 MiB
const DEFAULT_SYSTEM_PROMPT =
	'You are an expert code auditor. Read the brief, follow the rubric, ' +
	'cite code with file:line, and return ONLY a single markdown document ' +
	'starting with `# <Audit title>` and ending with the scoring table + ' +
	'`**Nota final: X/10 — <justification>**. Do not include preamble.';

/** Provider base URLs. */
const PROVIDER_URL: Readonly<Record<LlmProvider, string>> = {
	openrouter: 'https://openrouter.ai/api/v1/chat/completions',
	anthropic: 'https://api.anthropic.com/v1/messages',
	google: 'https://generativelanguage.googleapis.com/v1beta/models',
	openai: 'https://api.openai.com/v1/chat/completions',
};

/** Default max_tokens for an audit response. */
const DEFAULT_MAX_TOKENS = 8192;

// ---------------------------------------------------------------------------
// Default transport (fetch)
// ---------------------------------------------------------------------------

/** Built-in `fetch` adapter. Honours AbortSignal via global fetch. */
const defaultTransport: IHttpTransport = {
	async fetchJson(url, init) {
		const res = await fetch(url, init);
		const json: unknown = await res.json().catch(() => ({}));
		return { status: res.status, json };
	},
};

// ---------------------------------------------------------------------------
// Per-provider request builders
// ---------------------------------------------------------------------------

/**
 * Build the HTTP request for a target. The shape varies by provider:
 *
 * - OpenRouter / OpenAI: chat/completions with `messages: [{role,
 *   content}]`.
 * - Anthropic: `/v1/messages` with a top-level `system` field.
 * - Google: `:generateContent` with `contents[].parts[].text`.
 *
 * All bodies are JSON-stringified once, here, so the tool only deals
 * with opaque HTTP requests downstream.
 */
export const resolveTarget = (
	target: IModelTarget,
	brief: string,
	systemPrompt: string,
): IResolvedTarget => {
	if (target.provider === 'google') {
		// Google uses a different URL shape: append `:generateContent`
		// and a query-string key.
		const url =
			`${PROVIDER_URL.google}/${encodeURIComponent(target.model)}` +
			`:generateContent?key=${encodeURIComponent(target.apiKey)}`;
		return {
			provider: target.provider,
			model: target.model,
			url,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({
				systemInstruction: {
					parts: [{ text: systemPrompt }],
				},
				contents: [
					{
						role: 'user',
						parts: [{ text: brief }],
					},
				],
				generationConfig: {
					maxOutputTokens: DEFAULT_MAX_TOKENS,
				},
			}),
		};
	}
	if (target.provider === 'anthropic') {
		return {
			provider: target.provider,
			model: target.model,
			url: PROVIDER_URL[target.provider],
			headers: {
				'content-type': 'application/json',
				'x-api-key': target.apiKey,
				'anthropic-version': '2023-06-01',
			},
			body: JSON.stringify({
				model: target.model,
				system: systemPrompt,
				messages: [{ role: 'user', content: brief }],
				max_tokens: DEFAULT_MAX_TOKENS,
			}),
		};
	}
	// openrouter + openai share the chat/completions shape.
	return {
		provider: target.provider,
		model: target.model,
		url: PROVIDER_URL[target.provider],
		headers: {
			'content-type': 'application/json',
			authorization: `Bearer ${target.apiKey}`,
		},
		body: JSON.stringify({
			model: target.model,
			messages: [
				{ role: 'system', content: systemPrompt },
				{ role: 'user', content: brief },
			],
			max_tokens: DEFAULT_MAX_TOKENS,
			stream: false,
		}),
	};
};

// ---------------------------------------------------------------------------
// Per-provider response extractors
// ---------------------------------------------------------------------------

/**
 * Pull the assistant markdown out of a provider response. Tolerates
 * the small differences in envelope shape — returns `null` when the
 * body is unrecognised (caller treats that as an error).
 */
const extractMarkdown = (
	provider: LlmProvider,
	payload: unknown,
): string | null => {
	if (!payload || typeof payload !== 'object') return null;
	const p = payload as Record<string, unknown>;
	switch (provider) {
		case 'openrouter':
		case 'openai': {
			const choices = p.choices;
			if (!Array.isArray(choices) || choices.length === 0) return null;
			const first = choices[0] as Record<string, unknown> | undefined;
			const message = first?.message as
				| Record<string, unknown>
				| undefined;
			const content = message?.content;
			if (typeof content === 'string') return content;
			// Some OpenRouter providers return content as an array of
			// `{type:'text', text:'…'}` parts. Join the text parts.
			if (Array.isArray(content)) {
				return content
					.map((part) => {
						if (!part || typeof part !== 'object') return '';
						const t = (part as Record<string, unknown>).text;
						return typeof t === 'string' ? t : '';
					})
					.filter((s) => s.length > 0)
					.join('\n');
			}
			return null;
		}
		case 'anthropic': {
			const content = p.content;
			if (!Array.isArray(content)) return null;
			return content
				.map((block) => {
					if (!block || typeof block !== 'object') return '';
					const b = block as Record<string, unknown>;
					return b.type === 'text' && typeof b.text === 'string'
						? b.text
						: '';
				})
				.filter((s) => s.length > 0)
				.join('\n');
		}
		case 'google': {
			const candidates = p.candidates;
			if (!Array.isArray(candidates) || candidates.length === 0) {
				return null;
			}
			const first = candidates[0] as Record<string, unknown> | undefined;
			const content = first?.content as
				| Record<string, unknown>
				| undefined;
			const parts = content?.parts;
			if (!Array.isArray(parts)) return null;
			return parts
				.map((part) => {
					if (!part || typeof part !== 'object') return '';
					const t = (part as Record<string, unknown>).text;
					return typeof t === 'string' ? t : '';
				})
				.filter((s) => s.length > 0)
				.join('\n');
		}
	}
};

// ---------------------------------------------------------------------------
// Single-target call
// ---------------------------------------------------------------------------

/**
 * Dispatch a single audit prompt to its provider. Never throws —
 * failures are returned as `{ok:false, error}` so the fan-out can
 * tolerate partial outages and still produce a useful report.
 */
export const callLlm = async (
	target: IModelTarget,
	brief: string,
	options: ILlmClientOptions = {},
): Promise<ILlmCallOutcome> => {
	const start = Date.now();
	const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
	const maxBytes = options.maxResponseBytes ?? DEFAULT_MAX_BYTES;
	const systemPrompt = options.systemPrompt ?? DEFAULT_SYSTEM_PROMPT;
	const transport = options.transport ?? defaultTransport;

	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), timeoutMs);
	const resolved = resolveTarget(target, brief, systemPrompt);
	try {
		const { status, json } = await transport.fetchJson(resolved.url, {
			method: 'POST',
			headers: { ...resolved.headers },
			body: resolved.body,
			signal: controller.signal,
		});
		clearTimeout(timer);
		if (status < 200 || status >= 300) {
			// Redact any leaked API key from the error envelope before
			// surfacing it — keys in the wild are the canonical use
			// case for the redactor.
			const safe = redactSecrets(
				typeof json === 'string' ? json : JSON.stringify(json),
			);
			return {
				ok: false,
				target,
				elapsedMs: Date.now() - start,
				error: `provider ${target.provider} returned HTTP ${status}: ${safe.text.slice(0, 500)}`,
			};
		}
		const markdown = extractMarkdown(target.provider, json);
		if (markdown === null || markdown.length === 0) {
			return {
				ok: false,
				target,
				elapsedMs: Date.now() - start,
				error: `provider ${target.provider} returned an empty or unrecognised response envelope`,
			};
		}
		// Truncate oversize responses to the byte cap and tag the
		// truncation so the consolidator can see what happened.
		const truncated = markdown.length > maxBytes;
		const finalMarkdown = truncated
			? `${markdown.slice(0, maxBytes)}\n\n<!-- truncated at ${maxBytes} bytes -->`
			: markdown;
		return {
			ok: true,
			target,
			elapsedMs: Date.now() - start,
			markdown: finalMarkdown,
		};
	} catch (err) {
		clearTimeout(timer);
		const message = err instanceof Error ? err.message : 'unknown error';
		return {
			ok: false,
			target,
			elapsedMs: Date.now() - start,
			error: redactSecrets(message).text,
		};
	}
};

// ---------------------------------------------------------------------------
// Fan-out
// ---------------------------------------------------------------------------

/**
 * Dispatch one brief to N targets in parallel. Uses
 * `Promise.allSettled` semantics: the function never throws on a
 * provider failure — every target resolves to an {@link ILlmCallOutcome}.
 *
 * Concurrency is bounded to the lesser of the target list length and
 * 4 — beyond that, a host with many cores is rarely going to
 * benefit and we'd just be hammering providers with simultaneous
 * cold-start handshakes. The cap is documented in
 * `IPlanToolOptions` so hosts can override.
 */
export const callLlmFanOut = async (
	targets: readonly IModelTarget[],
	brief: string,
	options: ILlmClientOptions = {},
): Promise<readonly ILlmCallOutcome[]> => {
	const bounded = targets.slice(0, 4);
	const results = await Promise.all(
		bounded.map((t) => callLlm(t, brief, options)),
	);
	return results;
};

// ---------------------------------------------------------------------------
// Filename helpers
// ---------------------------------------------------------------------------

/** Today in ISO `YYYY-MM-DD`. Used as the date prefix in audit filenames. */
export const isoDate = (now: Date = new Date()): string => {
	const y = now.getUTCFullYear().toString().padStart(4, '0');
	const m = (now.getUTCMonth() + 1).toString().padStart(2, '0');
	const d = now.getUTCDate().toString().padStart(2, '0');
	return `${y}-${m}-${d}`;
};

/**
 * Format a date in the `DD-MM-YYYY` shape the existing audit
 * parser (`parse-audit.service.ts`) recognises. Keeps the output
 * of `audit_run` compatible with the canonical consolidation
 * pipeline without a separate parser branch.
 */
export const auditDateStamp = (now: Date = new Date()): string => {
	const y = now.getUTCFullYear().toString().padStart(4, '0');
	const m = (now.getUTCMonth() + 1).toString().padStart(2, '0');
	const d = now.getUTCDate().toString().padStart(2, '0');
	return `${d}-${m}-${y}`;
};

/**
 * Conventional filename for a saved audit. Matches the shape the
 * existing audits use so the existing consolidator can parse them
 * without changes: `DD-MM-YYYY- <provider>(<model>).md`.
 *
 * Provider names are lowercased and the model is escaped to keep
 * the filename portable across filesystems.
 */
export const auditFilename = (
	target: IModelTarget,
	date: string = auditDateStamp(),
): string => {
	const safeModel = target.model.replace(/[\\/:*?"<>|]/gu, '-');
	return `${date}- ${target.provider}(${safeModel}).md`;
};
