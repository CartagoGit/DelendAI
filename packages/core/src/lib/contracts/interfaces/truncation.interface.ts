export interface ITruncationResult<T> {
	readonly value: T;
	readonly truncated: boolean;
	readonly originalBytes: number;
	readonly finalBytes: number;
	readonly clamped?: true;
}

export interface ITruncatedEnvelope {
	readonly __truncated: true;
	readonly originalBytes: number;
	readonly maxBytes: number;
	readonly finalBytes: number;
	readonly clamped?: true;
	readonly head?: unknown;
}
