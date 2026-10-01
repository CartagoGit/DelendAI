import { createHash } from 'node:crypto';

export const DEFAULT_EMBED_DIMENSIONS = 64;

export interface IEmbedder {
	readonly id: string;
	isAvailable(): Promise<boolean>;
	embed(text: string): Promise<readonly number[]>;
}

const tokenize = (text: string): readonly string[] => {
	const normalized = text.toLowerCase().trim();
	const tokens = normalized.match(/[a-z0-9]+/g) ?? [];
	return tokens.length > 0 ? tokens : [normalized];
};

const normalizeVector = (vector: readonly number[]): readonly number[] => {
	const magnitude = Math.sqrt(
		vector.reduce((sum, value) => sum + value * value, 0),
	);
	if (magnitude === 0) {
		return vector.map(() => 0);
	}
	return vector.map((value) => value / magnitude);
};

export const buildDeterministicHashEmbedder = (options?: {
	readonly dimensions?: number;
}): IEmbedder => {
	const dimensions = options?.dimensions ?? DEFAULT_EMBED_DIMENSIONS;
	return {
		id: 'deterministic-hash',
		isAvailable: async () => true,
		embed: async (text: string) => {
			const tokens = tokenize(text);
			const vector = Array.from<number>({ length: dimensions }).fill(0);
			for (const token of tokens) {
				const digest = createHash('sha512').update(token).digest();
				for (let index = 0; index < dimensions; index += 1) {
					const byte = digest[index % digest.length] ?? 0;
					const signByte = digest[(index + 17) % digest.length] ?? 0;
					const sign = (signByte & 1) === 0 ? -1 : 1;
					vector[index] =
						(vector[index] ?? 0) + sign * ((byte + 1) / 256);
				}
			}
			return normalizeVector(vector);
		},
	};
};

export const defaultEmbedder = buildDeterministicHashEmbedder();
