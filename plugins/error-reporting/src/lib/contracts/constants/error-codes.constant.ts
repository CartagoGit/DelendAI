export const DELENDAI_ERROR_CODES = [
	'PLUGIN_REGISTER_TIMEOUT',
	'PLUGIN_LOAD_FAILED',
	'PLUGIN_DISPOSE_FAILED',
	'TOOL_EXECUTION_FAILED',
	'HOOK_FAILED',
	'INVALID_OPTIONS',
	'MUTEX_STALE_LOCK',
	'PROCESS_TIMEOUT',
] as const;

export type DelendaiErrorCode = (typeof DELENDAI_ERROR_CODES)[number];

export const isDelendaiErrorCode = (
	value: unknown,
): value is DelendaiErrorCode =>
	typeof value === 'string' &&
	(DELENDAI_ERROR_CODES as readonly string[]).includes(value);
