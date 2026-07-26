/**
 * f00133 — `container` plugin entry point.
 *
 * S1 (inspect, this slice): `container_ps`, `container_images`,
 *   `k8s_get`. Read-only over the host's docker/kubectl CLIs.
 * S2 (logs + Dockerfile lint): future slice.
 * S3 (consented build/apply): future slice.
 *
 * Every tool probes the CLI via the shared r00012 `probeTool` first;
 * when the binary is missing it returns a structured `install-missing`
 * response with the first install hint so the host can surface the
 * one-liner install command instead of crashing (same posture as the
 * browser plugin's Playwright probe). Nothing here ever bundles a
 * container engine — the user opts in by installing docker/kubectl.
 */
import { z } from 'zod';

import { definePlugin } from '@mcp-vertex/core/public';

import { buildContainerInspectToolRegistrations } from './lib/tools/container-inspect.tool';

const OptionsSchema = z.object({});

export default definePlugin({
	name: 'container',
	version: '0.1.0',
	describe:
		'Read-only container plugin: inspect (S1) over the host docker/kubectl CLIs; missing CLI → install hint, never a crash.',
	optionsSchema: OptionsSchema,
	register(ctx) {
		const parsed = OptionsSchema.safeParse(ctx.options ?? {});
		if (!parsed.success) {
			throw new Error(
				`container plugin rejected its options: ${parsed.error.message}`,
			);
		}
		return {
			tools: [
				...buildContainerInspectToolRegistrations({
					namespacePrefix: ctx.namespacePrefix,
				}),
			],
			knowledge: [
				{
					id: 'container-usage',
					title: 'Container plugin — read-only inspect',
					body: [
						'# Container plugin',
						'',
						'Tool (S1):',
						'',
						`- \`\${ctx.namespacePrefix}_container_inspect\` — inspect Docker containers / images or Kubernetes pods via the host CLI. Pass \`kind: "docker-ps"\`, \`kind: "docker-images"\` or \`kind: "k8s-get"\` (with optional \`namespace\`).`,
						'',
						'Read-only by default. When `docker` or `kubectl` is missing, the tool returns a structured `kind: "skipped"` envelope with the first install hint so the host can surface the one-liner install command. The plugin never bundles a container engine — install docker / kubectl yourself.',
						'',
						'Wraps the host CLIs via the shared r00012 probe + runner (no shell, bounded output, argv-only).',
					].join('\n'),
				},
			],
		};
	},
});
