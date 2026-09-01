import type { IPluginRuntime } from '../contracts/interfaces/plugin-runtime.interface';
import type {
	IMcpPlugin,
	IMcpPluginContext,
	IMcpPluginRegistrations,
} from './plugin-contract';

interface ILoadedPluginRuntimeEntry {
	readonly specifier: string;
	readonly resolved: string;
	readonly plugin: IMcpPlugin;
	readonly registrations: IMcpPluginRegistrations;
	readonly runtime: IPluginRuntime<IMcpPluginRegistrations>;
}

const isObject = (value: unknown): value is Record<string, unknown> =>
	typeof value === 'object' && value !== null;

const isPluginRuntime = (
	value: unknown,
): value is IPluginRuntime<IMcpPluginRegistrations> =>
	isObject(value) && 'registrations' in value;

/**
 * @internal
 * Not part of the public API. Subject to change without notice.
 * Migrated to `*Internal` naming under b00238 (Track N / q00006 §50).
 */
export const normalizePluginRuntimeInternal = (
	value: IMcpPluginRegistrations | IPluginRuntime<IMcpPluginRegistrations>,
): IPluginRuntime<IMcpPluginRegistrations> => {
	if (isPluginRuntime(value)) {
		return {
			registrations: value.registrations,
			dispose: value.dispose,
			abortable: value.abortable ?? value.dispose !== undefined,
		};
	}
	return {
		registrations: value,
		abortable: false,
	};
};

/**
 * @deprecated Use `normalizePluginRuntimeInternal` instead. Kept as a
 * thin re-export for one minor cycle.
 */
export const normalizePluginRuntime = normalizePluginRuntimeInternal;

export const extractPartialRuntime = (
	error: unknown,
): IPluginRuntime<IMcpPluginRegistrations> | undefined => {
	if (!isObject(error)) return undefined;
	if ('runtime' in error) {
		const candidate = error.runtime;
		if (candidate !== undefined) {
			return normalizePluginRuntimeInternal(
				candidate as
					| IMcpPluginRegistrations
					| IPluginRuntime<IMcpPluginRegistrations>,
			);
		}
	}
	if ('registrations' in error) {
		return normalizePluginRuntimeInternal({
			registrations: error.registrations as IMcpPluginRegistrations,
			dispose:
				typeof error.dispose === 'function'
					? (error.dispose as () => Promise<void> | void)
					: undefined,
			abortable:
				typeof error.abortable === 'boolean'
					? error.abortable
					: undefined,
		});
	}
	return undefined;
};

const formatRegisterAbortMessage = (
	pluginName: string,
	reason: 'timeout' | 'signal',
	timeoutMs: number,
): string => {
	if (reason === 'timeout') {
		return `plugin "${pluginName}" register() timed out after ${timeoutMs}ms`;
	}
	return `plugin "${pluginName}" register() aborted by signal`;
};

const toAbortError = (message: string, reason?: unknown): Error => {
	if (reason instanceof Error) return reason;
	const error = new Error(message);
	error.name = 'AbortError';
	return error;
};

const safeDisposeRuntime = async (
	entry: ILoadedPluginRuntimeEntry,
	onError?:
		| ((entry: ILoadedPluginRuntimeEntry, error: unknown) => void)
		| undefined,
): Promise<void> => {
	if (entry.runtime.dispose === undefined) return;
	try {
		await entry.runtime.dispose();
	} catch (error) {
		onError?.(entry, error);
	}
};

export const disposeLoadedPlugins = async (
	loaded: readonly ILoadedPluginRuntimeEntry[],
	input?: {
		onError?:
			| ((entry: ILoadedPluginRuntimeEntry, error: unknown) => void)
			| undefined;
		onDisposed?: ((entry: ILoadedPluginRuntimeEntry) => void) | undefined;
	},
): Promise<void> => {
	for (const entry of [...loaded].reverse()) {
		await safeDisposeRuntime(entry, input?.onError);
		input?.onDisposed?.(entry);
	}
};

export const registerPluginWithLifecycle = async (input: {
	readonly plugin: IMcpPlugin;
	readonly ctx: IMcpPluginContext;
	readonly timeoutMs: number;
	readonly signal?: AbortSignal | undefined;
}): Promise<IPluginRuntime<IMcpPluginRegistrations>> => {
	const { plugin, ctx, timeoutMs, signal } = input;
	if (signal?.aborted) {
		throw toAbortError(
			formatRegisterAbortMessage(plugin.name, 'signal', timeoutMs),
			signal.reason,
		);
	}
	const controller = new AbortController();
	let timer: ReturnType<typeof setTimeout> | undefined;
	let cancelReason: 'timeout' | 'signal' | undefined;
	const registerPromise = Promise.resolve(
		plugin.register(ctx, controller.signal),
	).then((result) => normalizePluginRuntimeInternal(result));
	void registerPromise.catch(() => undefined);
	const cleanupHandlers: Array<() => void> = [];
	const cancellationPromise = new Promise<never>((_resolve, reject) => {
		const rejectWith = (
			reason: 'timeout' | 'signal',
			value?: unknown,
		): void => {
			if (cancelReason !== undefined) return;
			cancelReason = reason;
			const error = toAbortError(
				formatRegisterAbortMessage(plugin.name, reason, timeoutMs),
				value,
			);
			controller.abort(error);
			reject(error);
		};
		if (signal) {
			const onAbort = (): void => rejectWith('signal', signal.reason);
			signal.addEventListener('abort', onAbort, { once: true });
			cleanupHandlers.push(() =>
				signal.removeEventListener('abort', onAbort),
			);
		}
		timer = setTimeout(() => rejectWith('timeout'), timeoutMs);
	});
	try {
		return await Promise.race([registerPromise, cancellationPromise]);
	} catch (error) {
		if (cancelReason !== undefined) {
			void registerPromise.then(
				async (runtime) => {
					await safeDisposeRuntime({
						specifier: plugin.name,
						resolved: plugin.name,
						plugin,
						registrations: runtime.registrations,
						runtime,
					});
				},
				() => undefined,
			);
		}
		throw error;
	} finally {
		if (timer !== undefined) clearTimeout(timer);
		for (const cleanup of cleanupHandlers) cleanup();
	}
};
