import z from 'zod';

import type { IK8sPodSummary } from './types';

const KubectlGetSchema = z
	.object({
		items: z
			.array(
				z
					.object({
						metadata: z
							.object({
								name: z.string().optional(),
								namespace: z.string().optional(),
							})
							.optional(),
						spec: z
							.object({
								nodeName: z.string().optional(),
								containers: z
									.array(
										z.object({
											name: z.string().optional(),
										}),
									)
									.optional(),
							})
							.optional(),
						status: z
							.object({
								phase: z.string().optional(),
								podIP: z.string().optional(),
							})
							.optional(),
					})
					.passthrough(),
			)
			.optional(),
	})
	.passthrough();

export const parseKubectlGet = (raw: string): readonly IK8sPodSummary[] => {
	try {
		const parsed = KubectlGetSchema.safeParse(JSON.parse(raw));
		if (!parsed.success) return [];
		return (parsed.data.items ?? []).map((item) => ({
			name: item.metadata?.name ?? '',
			namespace: item.metadata?.namespace ?? 'default',
			status: item.status?.phase ?? 'Unknown',
			...(item.spec?.nodeName !== undefined
				? { nodeName: item.spec.nodeName }
				: {}),
			...(item.status?.podIP !== undefined
				? { podIp: item.status.podIP }
				: {}),
			containers: (item.spec?.containers ?? [])
				.map((container) => container.name ?? '')
				.filter((name) => name.length > 0),
		}));
	} catch {
		return [];
	}
};
