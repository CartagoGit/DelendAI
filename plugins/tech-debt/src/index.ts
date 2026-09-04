import { definePlugin } from '@delendai/core/public';
import z from 'zod';

import { buildDebtScanRegistration } from './lib/tools/debt-scan.tool';

/**
 * Tech-debt plugin. `debt_scan` surfaces marker comments
 * (TODO/FIXME/HACK/XXX/BUG/DEPRECATED/NOTE) across the workspace as
 * severity-ranked findings — a fast "what's left?" over a codebase. Offline,
 * read-only. Load with `delendai --plugins=tech-debt`.
 */
const OptionsSchema = z.object({});

export default definePlugin({
	name: 'tech-debt',
	version: '0.1.1',
	describe:
		'Tech-debt visibility: debt_scan finds TODO/FIXME/HACK/XXX/BUG/DEPRECATED/NOTE markers across the workspace, ranked by severity. Offline.',
	optionsSchema: OptionsSchema,
	register(ctx) {
		return {
			tools: [
				buildDebtScanRegistration({
					namespacePrefix: ctx.namespacePrefix,
					workspaceRootAbs: ctx.workspace.root,
				}),
			],
			knowledge: [
				{
					id: 'tech-debt-usage',
					title: 'Tech-debt marker scan',
					body: [
						'# Tech-debt marker scan',
						'',
						`Tool: \`${ctx.namespacePrefix}_debt_scan\` — surface marker comments across the workspace (offline).`,
						'',
						'- Severity by marker: FIXME/BUG (high), XXX/HACK/DEPRECATED (medium), TODO (low), NOTE (info).',
						'- Skips node_modules, dist, build, .cache, .git — only real source is scanned.',
						'- Pass `only` (e.g. `["FIXME"]`) to narrow to specific marker kinds.',
						'- Great for a pre-release sweep: "what did we mark to fix before shipping?"',
					].join('\n'),
				},
			],
		};
	},
});
