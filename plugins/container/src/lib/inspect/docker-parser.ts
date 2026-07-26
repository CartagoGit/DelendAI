import { z } from 'zod';

const PS_ROW = z.object({
	ID: z.string().optional(),
	Names: z.string().optional(),
	Image: z.string().optional(),
	Command: z.string().optional(),
	CreatedAt: z.string().optional(),
	State: z.string().optional(),
	Status: z.string().optional(),
	Ports: z.string().optional(),
});

const IMAGE_ROW = z.object({
	ID: z.string().optional(),
	Repository: z.string().optional(),
	Tag: z.string().optional(),
	Size: z.string().optional(),
	CreatedAt: z.string().optional(),
});

export interface IContainerRow {
	readonly id: string;
	readonly name: string;
	readonly image: string;
	readonly state: string;
	readonly status: string;
	readonly ports: string;
	readonly createdAt: string;
}

export interface IContainerImageRow {
	readonly id: string;
	readonly repository: string;
	readonly tag: string;
	readonly size: string;
	readonly createdAt: string;
}

export interface IParseOutcome<T> {
	readonly rows: readonly T[];
	readonly skipped: number;
}

const safeParseLines = <T>(
	lines: readonly string[],
	schema: z.ZodType<T>,
): IParseOutcome<T> => {
	const rows: T[] = [];
	let skipped = 0;
	for (const line of lines) {
		const trimmed = line.trim();
		if (trimmed === '') continue;
		try {
			rows.push(schema.parse(JSON.parse(trimmed)));
		} catch {
			skipped += 1;
		}
	}
	return { rows, skipped };
};

export const parseDockerPs = (
	lines: readonly string[],
): IParseOutcome<IContainerRow> => {
	const { rows, skipped } = safeParseLines(lines, PS_ROW);
	return {
		rows: rows.map((row) => ({
			id: row.ID ?? '',
			name: row.Names ?? '',
			image: row.Image ?? '',
			state: row.State ?? '',
			status: row.Status ?? '',
			ports: row.Ports ?? '',
			createdAt: row.CreatedAt ?? '',
		})),
		skipped,
	};
};

export const parseDockerImages = (
	lines: readonly string[],
): IParseOutcome<IContainerImageRow> => {
	const { rows, skipped } = safeParseLines(lines, IMAGE_ROW);
	return {
		rows: rows.map((row) => ({
			id: row.ID ?? '',
			repository: row.Repository ?? '',
			tag: row.Tag ?? '',
			size: row.Size ?? '',
			createdAt: row.CreatedAt ?? '',
		})),
		skipped,
	};
};
