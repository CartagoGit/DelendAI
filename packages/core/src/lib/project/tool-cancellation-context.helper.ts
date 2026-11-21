/** The reason, next step and cause reported when a tool call is aborted. */
export const toolCancellationContext = (signal: AbortSignal | undefined) => {
	const error = signal?.reason ?? new Error('tool invocation aborted');
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
