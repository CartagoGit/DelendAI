import z from 'zod';

import type { IDockerImage } from './types';

const DockerImagesRow = z
	.object({
		ID: z.string().optional(),
		Repository: z.string().optional(),
		Tag: z.string().optional(),
		Size: z.string().optional(),
		CreatedAt: z.string().optional(),
	})
	.passthrough();

const toIso = (value: string | undefined): string => {
	const raw = value?.trim() ?? '';
	if (raw === '') return '';
	const parsed = new Date(raw);
	return Number.isNaN(parsed.getTime()) ? raw : parsed.toISOString();
};

export const parseDockerImages = (raw: string): readonly IDockerImage[] => {
	const items: IDockerImage[] = [];
	for (const line of raw.split(/\r?\n/u)) {
		const trimmed = line.trim();
		if (trimmed === '') continue;
		try {
			const parsed = DockerImagesRow.safeParse(JSON.parse(trimmed));
			if (!parsed.success) continue;
			items.push({
				id: parsed.data.ID ?? '',
				repository: parsed.data.Repository ?? '',
				tag: parsed.data.Tag ?? '',
				size: parsed.data.Size ?? '',
				createdAt: toIso(parsed.data.CreatedAt),
			});
		} catch {}
	}
	return items;
};
