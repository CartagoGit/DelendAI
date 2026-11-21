/**
 * with-error-collection.ts — f00251 S1.
 *
 * A safe handler wrapper that automatically captures any error thrown by
 * the wrapped function, records it through the collector, and then
 * re-throws the original error unchanged.
 *
 * ## Contract
 *
 * - Success path: the handler's result is returned as-is; `record` is
 *   never called.
 * - Error path: any thrown value (sync or async) is captured, the collector
 *   records it, the optional `onError` hook is invoked with the redacted
 *   event, and the **original** error is re-thrown with the same identity.
 * - The wrapper never swallows errors — the caller always sees the original
 *   rejection/throw.
 *
 * @example
 * ```ts
 * const safeTool = withErrorCollection(myTool, {
 *   toolMeta: { toolName: 'my_tool', packageId: '@scope/pkg', pluginName: 'my-plugin' },
 *   collector,
 * });
 * ```
 */
import type { IErrorCollector } from './collector.interface.js';
import type { ICapturedError, ICapturedErrorContext } from './types.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Identifies the tool being wrapped (used for error-capture context). */
export interface IToolMetaForError {
	readonly toolName: string;
	readonly packageId: string;
	readonly pluginName: string;
}

/** Options accepted by `withErrorCollection`. */
export interface IWithErrorCollectionOptions {
	/** Tool identity forwarded to `collector.record` as context. */
	readonly toolMeta: IToolMetaForError;
	/** Collector that receives the captured error. */
	readonly collector: IErrorCollector;
	/**
	 * Optional hook invoked with the redacted `ICapturedError` after the
	 * collector has recorded it.  Called before the original error is
	 * re-thrown.
	 */
	readonly onError?: (captured: ICapturedError) => void;
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Wrap `handler` so that any error it throws is automatically captured,
 * recorded, and re-thrown.
 *
 * @example
 * ```ts
 * const safe = withErrorCollection(fetchData, { toolMeta, collector });
 * const result = await safe({ id: 42 }); // captures + rethrows on failure
 * ```
 */
export function withErrorCollection<TArgs, TResult>(
	handler: (args: TArgs) => Promise<TResult>,
	options: IWithErrorCollectionOptions,
): (args: TArgs) => Promise<TResult> {
	const context: ICapturedErrorContext = {
		toolName: options.toolMeta.toolName,
		packageId: options.toolMeta.packageId,
		pluginName: options.toolMeta.pluginName,
	};

	return async (args: TArgs): Promise<TResult> => {
		let result: TResult;
		try {
			result = await handler(args);
		} catch (thrown: unknown) {
			// Record the error and obtain the redacted event for the hook.
			const captured = await options.collector.record(thrown, context);
			options.onError?.(captured);
			// Always rethrow the original error unchanged.
			throw thrown;
		}
		return result;
	};
}
