import z from 'zod';

import type { IDockerContainer } from './types';

const DockerPsRow = z
	.object({
		ID: z.string().optional(),
		Names: z.string().optional(),
		Image: z.string().optional(),
		Status: z.string().optional(),
		Ports: z.string().optional(),
		CreatedAt: z.string().optional(),
	})
	.passthrough();

const toIso = (value: string | undefined): string => {
	const raw = value?.trim() ?? '';
	if (raw === '') return '';
	const parsed = new Date(raw);
	return Number.isNaN(parsed.getTime()) ? raw : parsed.toISOString();
};

const splitPorts = (value: string | undefined): readonly string[] =>
	(value ?? '')
		.split(',')
		.map((entry) => entry.trim())
		.filter((entry) => entry.length > 0);

export const parseDockerPs = (raw: string): readonly IDockerContainer[] => {
	const items: IDockerContainer[] = [];
	for (const line of raw.split(/\r?\n/u)) {
		const trimmed = line.trim();
		if (trimmed === '') continue;
		try {
			const parsed = DockerPsRow.safeParse(JSON.parse(trimmed));
			if (!parsed.success) continue;
			items.push({
				id: parsed.data.ID ?? '',
				name: parsed.data.Names ?? '',
				image: parsed.data.Image ?? '',
				status: parsed.data.Status ?? '',
				ports: splitPorts(parsed.data.Ports),
				createdAt: toIso(parsed.data.CreatedAt),
			});
		} catch {}
	}
	return items;
};
