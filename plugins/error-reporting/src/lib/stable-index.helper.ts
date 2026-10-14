export const stableIndexOf = (input: {
	readonly seed: string;
	readonly length: number;
	readonly multiplier: number;
}): number => {
	let hash = 0;
	for (const char of input.seed) {
		hash = (hash * input.multiplier + char.charCodeAt(0)) >>> 0;
	}
	return hash % input.length;
};
