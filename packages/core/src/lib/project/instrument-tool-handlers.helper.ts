import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import type { IMcpVertexHostConfig } from '../contracts/interfaces/host-config.interface';
import type { PluginHookName } from '../contracts/interfaces/plugin-lifecycle-error.interface';
import {
	estimateErrorCost,
	estimateResultCost,
} from '../metrics/metrics-registry';
import {
	injectCheckpointAdvisory,
	selectCheckpointAdvisory,
} from '../shared/checkpoint-advisory';
import { toolError } from '../shared/tool-response';

const resolveLogFilePath = (
	config: IMcpVertexHostConfig,
	now: Date,
): string | null => {
	if (!config.corePaths) return null;
	const cacheDir = config.workspace.resolve(config.corePaths.cacheDir);
	if (!cacheDir) return null;
	const dateStr = now.toISOString().slice(0, 10);
	const sep = cacheDir.includes('\\') ? '\\' : '/';
	return `${cacheDir}${sep}results${sep}logs-errors${sep}${dateStr}.jsonl`;
};

const injectLogHintIntoResult = (
	result: unknown,
	logPath: string | null,
	now: Date,
): void => {
	if (!result || typeof result !== 'object') return;
	if (
		!Array.isArray(result) &&
		(result as { isError?: boolean }).isError !== true
	)
		return;
	const resObj = result as Record<string, unknown>;
	const structured = resObj.structuredContent;
	if (
		structured === null ||
		typeof structured !== 'object' ||
		Array.isArray(structured)
	) {
		return;
	}
	const structuredObj = structured as Record<string, unknown>;
	if ('logHint' in structuredObj) return;
	if (logPath === null) return;
	structuredObj.logHint = {
		path: logPath,
		line: 0,
		ts: now.toISOString(),
	};
};

export const instrumentToolHandlers = (
	server: McpServer,
	config: IMcpVertexHostConfig,
): void => {
	type RegisterTool = McpServer['registerTool'];
	const original = server.registerTool.bind(server) as RegisterTool;
	const findAbortSignal = (
		args: readonly unknown[],
	): AbortSignal | undefined => {
		for (const arg of args) {
			const signal = (arg as { signal?: unknown } | null)?.signal;
			if (signal instanceof AbortSignal) return signal;
		}
		return undefined;
	};
	let lastCheckpointDedupeKey: string | null = null;
	const wrap = (name: string, handler: unknown): unknown => {
		if (typeof handler !== 'function') return handler;
		const fn = handler as (...args: unknown[]) => unknown;
		return async (...args: unknown[]): Promise<unknown> => {
			const emitHookError = (info: {
				readonly hookName: PluginHookName;
				readonly toolName: string;
				readonly args: unknown;
				readonly error: unknown;
				readonly elapsedMs?: number;
			}): void => {
				try {
					void Promise.resolve(
						config.onHookError?.({
							pluginName: 'host',
							resolvedSpecifier: 'host',
							...info,
						}),
					).catch(() => {});
				} catch {
					// Ignored
				}
			};
			const start = performance.now();
			const signal = findAbortSignal(args);
			const hookArgs =
				args[0] !== undefined &&
				(args[0] as { signal?: unknown } | null)?.signal instanceof
					AbortSignal
					? {}
					: args[0];
			let result: unknown;
			let isError = false;
			let error: unknown;
			let onAbort: (() => void) | undefined;
			if (signal !== undefined && config.onToolCancel) {
				const onToolCancel = config.onToolCancel;
				let cancelReported = false;
				onAbort = () => {
					if (cancelReported) return;
					cancelReported = true;
					try {
						void Promise.resolve(
							onToolCancel(
								name,
								hookArgs,
								performance.now() - start,
							),
						).catch((hookError) => {
							emitHookError({
								hookName: 'onToolCancel',
								toolName: name,
								args: hookArgs,
								error: hookError,
								elapsedMs: performance.now() - start,
							});
						});
					} catch (hookError) {
						emitHookError({
							hookName: 'onToolCancel',
							toolName: name,
							args: hookArgs,
							error: hookError,
							elapsedMs: performance.now() - start,
						});
					}
				};
				signal.addEventListener('abort', onAbort, { once: true });
				if (signal.aborted) onAbort();
			}
			try {
				if (config.onToolStart) {
					try {
						void Promise.resolve(
							config.onToolStart(name, hookArgs),
						).catch((hookError) => {
							emitHookError({
								hookName: 'onToolStart',
								toolName: name,
								args: hookArgs,
								error: hookError,
							});
						});
					} catch (hookError) {
						emitHookError({
							hookName: 'onToolStart',
							toolName: name,
							args: hookArgs,
							error: hookError,
						});
					}
				}
				const preBlock = config.beforeToolCall?.({
					toolName: name,
					args: hookArgs,
				});
				if (
					preBlock?.triggered === true &&
					preBlock.severity === 'block'
				) {
					if (preBlock.dedupeKey !== lastCheckpointDedupeKey) {
						lastCheckpointDedupeKey = preBlock.dedupeKey;
					}
					const blocked = toolError(
						preBlock.reason,
						preBlock.nextAction,
					);
					injectCheckpointAdvisory(blocked, preBlock);
					isError = true;
					result = blocked;
					return blocked;
				}
				result = await fn(...args);
				isError = (result as { isError?: boolean })?.isError === true;
				if (
					config.isAgentStuck &&
					result &&
					typeof result === 'object'
				) {
					const stuckInfo = config.isAgentStuck(name, hookArgs);
					if (stuckInfo) {
						const resObj = result as Record<string, unknown>;
						const structured =
							(resObj.structuredContent as Record<
								string,
								unknown
							>) ?? {};
						resObj.structuredContent = {
							...structured,
							__stuck_detected: true,
							handoffPath: stuckInfo.handoffPath,
							suggestedAction: stuckInfo.suggestedAction,
						};
					}
				}
				if (isError) {
					const now = new Date();
					injectLogHintIntoResult(
						result,
						resolveLogFilePath(config, now),
						now,
					);
				} else {
					const advisory = selectCheckpointAdvisory(
						[
							config.getCheckpointAdvisory?.({
								toolName: name,
								args: hookArgs,
							}),
						],
						lastCheckpointDedupeKey,
					);
					if (advisory !== null) {
						lastCheckpointDedupeKey = advisory.dedupeKey;
						injectCheckpointAdvisory(result, advisory);
					}
				}
				return result;
			} catch (err) {
				isError = true;
				error = err;
				throw err;
			} finally {
				if (signal !== undefined && onAbort !== undefined) {
					signal.removeEventListener('abort', onAbort);
				}
				const ms = performance.now() - start;
				if (config.metricsRegistry) {
					const cost = isError
						? estimateErrorCost(result, error)
						: estimateResultCost(result);
					config.metricsRegistry.record(name, {
						ms,
						bytes: cost.wireEstimateBytes,
						cost,
						isError,
					});
				}
				if (config.onToolCall) {
					try {
						void Promise.resolve(
							config.onToolCall(
								name,
								hookArgs,
								result,
								error,
								ms,
							),
						).catch((hookError) => {
							emitHookError({
								hookName: 'onToolCall',
								toolName: name,
								args: hookArgs,
								error: hookError,
								elapsedMs: ms,
							});
						});
					} catch (hookError) {
						emitHookError({
							hookName: 'onToolCall',
							toolName: name,
							args: hookArgs,
							error: hookError,
							elapsedMs: ms,
						});
					}
				}
			}
		};
	};
	(server as { registerTool: (...a: unknown[]) => unknown }).registerTool = (
		...callArgs: unknown[]
	) => {
		const name = callArgs[0] as string;
		const last = callArgs.length - 1;
		callArgs[last] = wrap(name, callArgs[last]);
		return (original as (...a: unknown[]) => unknown)(...callArgs);
	};
};
