import { z } from 'zod';

import { definePlugin } from '@mcp-vertex/core/public';

import { buildContainerInspectToolRegistrations } from './lib/tools/container-inspect.tool';
import { buildContainerLintToolRegistrations } from './lib/tools/container-lint.tool';

const OptionsSchema = z.object({});

export default definePlugin({
	name: 'container',
	version: '0.1.0',
	describe:
		'Container inspection: container_ps + container_images (Docker) + k8s_get (Kubernetes) — read-only by default. Probes docker/kubectl via r00012.',
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
				...buildContainerLintToolRegistrations({
					namespacePrefix: ctx.namespacePrefix,
				}),
			],
			knowledge: [
				{
					id: 'container-inspect-usage',
					title: 'Container inspection',
					body: [
						'# Container inspection',
						'',
						`Tool: \`${ctx.namespacePrefix}_container_inspect\` — inspect Docker containers/images or Kubernetes pods through the host CLI.`,
						'',
						'- Pass `kind: "docker-ps"` to list running containers.',
						'- Pass `kind: "docker-images"` to list local images.',
						'- Pass `kind: "k8s-get"` and optionally `namespace` to list pod summaries.',
						'- Missing `docker` or `kubectl` returns a typed skipped envelope with an install hint; the plugin never crashes on absent CLIs.',
					].join('\n'),
				},
			],
		};
	},
});
