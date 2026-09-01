import z from 'zod';

import { definePlugin } from '@mcp-vertex/core/public';

import { buildContainerInspectToolRegistrations } from './lib/tools/container-inspect.tool';
import {
	buildContainerLintToolRegistrations,
	buildContainerLogsToolRegistrations,
} from './lib/tools/container-lint.tool';
import { buildContainerBuildToolRegistrations } from './lib/tools/container-build.tool';

const OptionsSchema = z.object({});

export default definePlugin({
	name: 'container',
	version: '0.1.1',
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
				...buildContainerLogsToolRegistrations({
					namespacePrefix: ctx.namespacePrefix,
				}),
				...buildContainerLintToolRegistrations({
					namespacePrefix: ctx.namespacePrefix,
					workspaceRootAbs: ctx.workspace.root,
				}),
				...buildContainerBuildToolRegistrations({
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
				{
					id: 'container-logs-usage',
					title: 'Container logs',
					body: [
						'# Container logs',
						'',
						`Tool: \`${ctx.namespacePrefix}_container_logs\` — tail timestamped Docker logs with normalized stdout/stderr lines.`,
						'',
						'- Input: `{ container, tail?, since? }`.',
						'- Output: `{ ok: true, container, lines[] }` or `{ ok: "skipped", hint }` when docker is missing.',
						'- Uses `docker logs --tail N --timestamps`, keeping the parser pure and testable.',
					].join('\n'),
				},
				{
					id: 'container-lint-usage',
					title: 'Dockerfile lint',
					body: [
						'# Dockerfile lint',
						'',
						`Tool: \`${ctx.namespacePrefix}_container_lint\` — lint a workspace-contained Dockerfile with built-in hadolint-style rules.`,
						'',
						'- Input: `{ dockerfilePath? }`; defaults to `Dockerfile` at the workspace root.',
						'- Returns normalized findings for missing base-image pinning, apt/apk hygiene, shell-form CMD/ENTRYPOINT, and wget checksum gaps.',
						'- Containment is enforced before reading from disk; escaped paths return `containment-violation` instead of throwing.',
					].join('\n'),
				},
			],
		};
	},
});
