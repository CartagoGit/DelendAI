import { definePlugin } from '@mcp-vertex/core/public';
import { z } from 'zod';

import { buildSecurityAuditRegistration } from './lib/tools/security-audit.tool';
import { buildSecurityDepsRegistration } from './lib/tools/security-deps.tool';
import { buildSecuritySecretsRegistration } from './lib/tools/security-secrets.tool';

/**
 * Security scanning plugin. `security_secrets` detects leaked secrets
 * (private keys, cloud/API tokens) with high-precision offline rules and
 * reports them as normalized findings (r00012 shape). Offline, no network,
 * no bundled binaries. Load with `mcp-vertex --plugins=security`.
 */
const OptionsSchema = z.object({});

export default definePlugin({
	name: 'security',
	version: '0.1.0',
	describe:
		'Security scanning: security_secrets detects leaked secrets offline, security_deps audits dependency CVEs with optional OSV enrichment, and security_audit aggregates the posture into one backlog.',
	optionsSchema: OptionsSchema,
	register(ctx) {
		return {
			tools: [
				buildSecuritySecretsRegistration({
					namespacePrefix: ctx.namespacePrefix,
					workspaceRootAbs: ctx.workspace.root,
				}),
				buildSecurityDepsRegistration({
					namespacePrefix: ctx.namespacePrefix,
					workspaceRootAbs: ctx.workspace.root,
				}),
				buildSecurityAuditRegistration({
					namespacePrefix: ctx.namespacePrefix,
					workspaceRootAbs: ctx.workspace.root,
				}),
			],
			knowledge: [
				{
					id: 'security-usage',
					title: 'Security scanning',
					body: [
						'# Security scanning',
						'',
						`Tool: \`${ctx.namespacePrefix}_security_secrets\` — offline leaked-secret scan.`,
						`Tool: \`${ctx.namespacePrefix}_security_deps\` — dependency CVE scan via bun/npm/yarn audit, with optional OSV enrichment.`,
						`Tool: \`${ctx.namespacePrefix}_security_audit\` — aggregate posture scan across secrets, dependency CVEs and licenses.`,
						'',
						'- Scans git working-tree changes by default (`scope: "changed"`); pass `scope: "tracked"` for the whole repo.',
						'- `security_deps` stays offline unless `includeOsv:true`; missing CLIs degrade into a typed hint instead of crashing.',
						'- Findings are normalized (severity critical..info, rule id, file:line, redacted match) and the matched secret is never shown in full.',
						'- Test/fixture files are skipped unless `includeTests: true` (they legitimately carry sample secrets).',
						'- Offline + high-precision (known key/token shapes); no network, no bundled binaries. For deep SAST/CVE use dedicated tools.',
					].join('\n'),
				},
			],
		};
	},
});
