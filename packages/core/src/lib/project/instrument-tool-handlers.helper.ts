import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import type { IDelendaiHostConfig } from '../contracts/interfaces/host-config.interface';
import type { IToolMetaForError } from '../error-collection/with-error-collection';
import type { PluginHookName } from '../contracts/interfaces/plugin-lifecycle-error.interface';
import { withErrorCollection } from '../error-collection/with-error-collection';
import {
	estimateErrorCost,
	estimateResultCost,
} from '../metrics/metrics-registry';
import {
	injectCheckpointAdvisory,
	selectCheckpointAdvisory,
} from '../shared/checkpoint-advisory';
import { injectToolResultMeta, toolError } from '../shared/tool-response';

const resolveErrorToolMeta = (
	config: IDelendaiHostConfig,
	name: string,
): IToolMetaForError => {
	const descriptor = config.toolSurfacePlan?.descriptors.find(
		(entry) => entry.name === name || entry.registrationId === name,
	);
	if (descriptor?.pluginId !== undefined) {
		return {
			toolName: descriptor.registrationId,
			packageId: `@delendai/${descriptor.pluginId}`,
			pluginName: descriptor.pluginId,
		};
	}
	return {
		toolName: descriptor?.registrationId ?? name,
		packageId: '@delendai/core',
		pluginName: 'core',
	};
};

const resolveLogFilePath = (
	config: IDelendaiHostConfig,
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
	if (logPath === null) return;
	injectToolResultMeta(result, {
		logHint: {
			path: logPath,
			line: 0,
			ts: now.toISOString(),
		},
	});
};

export const instrumentToolHandlers = (
	server: McpServer,
	config: IDelendaiHostConfig,
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
		const invoke =
			config.errorCollector === undefined
				? async (callArgs: readonly unknown[]) => await fn(...callArgs)
				: withErrorCollection(
						async (callArgs: readonly unknown[]) =>
							await fn(...callArgs),
						{
							toolMeta: resolveErrorToolMeta(config, name),
							collector: config.errorCollector,
						},
					);
		return async (...args: unknown[]): Promise<unknown> => {
			const cancellationContext = (signal: AbortSignal | undefined) => {
				const error =
					signal?.reason ?? new Error('tool invocation aborted');
				const reason =
					typeof error === 'object' &&
					error !== null &&
					typeof (error as { message?: unknown }).message === 'string'
						? (error as { message: string }).message
						: String(error).replace(/^Error:\s*/u, '');
				return {
					reason: reason || 'tool invocation aborted',
					nextAction:
						'Retry the operation or resume from the latest persisted checkpoint.',
					error,
				};
			};
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
			let wasCancelled = false;
			let onAbort: (() => void) | undefined;
			if (signal !== undefined && config.onToolCancel) {
				const onToolCancel = config.onToolCancel;
				let cancelReported = false;
				onAbort = () => {
					if (cancelReported) return;
					cancelReported = true;
					wasCancelled = true;
					try {
						void Promise.resolve(
							onToolCancel(
								name,
								hookArgs,
								performance.now() - start,
								cancellationContext(signal),
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
				if (config.runtimeEventSink !== undefined) {
					void Promise.resolve(
						config.runtimeEventSink.emit({
							version: 1,
							ts: new Date().toISOString(),
							kind: 'tool.started',
							toolName: name,
						}),
					).catch(() => undefined);
				}
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
				result = await invoke(args);
				if (wasCancelled) {
					const cancellation = cancellationContext(signal);
					result = toolError(
						cancellation.reason,
						cancellation.nextAction,
					);
					injectToolResultMeta(result, {
						cancelled: true,
						error: String(cancellation.error),
					});
					isError = true;
					return result;
				}
				isError = (result as { isError?: boolean })?.isError === true;
				if (
					config.isAgentStuck &&
					result &&
					typeof result === 'object'
				) {
					const stuckInfo = config.isAgentStuck(name, hookArgs);
					if (stuckInfo) {
						injectToolResultMeta(result, {
							stuck: {
								detected: true,
								handoffPath: stuckInfo.handoffPath,
								suggestedAction: stuckInfo.suggestedAction,
							},
						});
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
				if (wasCancelled) {
					const cancellation = cancellationContext(signal);
					result = toolError(
						cancellation.reason,
						cancellation.nextAction,
					);
					injectToolResultMeta(result, {
						cancelled: true,
						error: String(err),
					});
					return result;
				}
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
				if (config.runtimeEventSink !== undefined) {
					void Promise.resolve(
						config.runtimeEventSink.emit({
							version: 1,
							ts: new Date().toISOString(),
							kind: isError ? 'tool.failed' : 'tool.completed',
							toolName: name,
							elapsedMs: ms,
							error: isError,
							estimatedTokens4B: isError
								? estimateErrorCost(result, error)
										.estimatedTokens.estimatedTokens4B
								: estimateResultCost(result).estimatedTokens
										.estimatedTokens4B,
						}),
					).catch(() => undefined);
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
