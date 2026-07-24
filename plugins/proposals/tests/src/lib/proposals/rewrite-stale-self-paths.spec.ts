import { describe, expect, it } from 'vitest';

import { rewriteStaleProposalSelfPaths } from '@mcp-vertex/proposals/lib/proposals/rewrite-stale-self-paths';

describe('rewriteStaleProposalSelfPaths (a00069 S3)', () => {
	const oldRel = 'ready/f00122-security-plugin.md';
	const newRel = 'done/feats/f00122-security-plugin.md';

	it('rewrites narrative **Files** bullets that point at the old self path', () => {
		const input = [
			'## Slices',
			'',
			'### S1 — close',
			`- **Files**: \`${oldRel}\`, \`plugins/security/src/index.ts\``,
			'- **Status**: pending',
			'',
		].join('\n');
		const result = rewriteStaleProposalSelfPaths(input, {
			oldRelPath: oldRel,
			newRelPath: newRel,
		});
		expect(result.replacements).toBe(1);
		expect(result.markdown).toContain(`\`${newRel}\``);
		expect(result.markdown).not.toContain(`\`${oldRel}\``);
		expect(result.markdown).toContain('`plugins/security/src/index.ts`');
	});

	it('rewrites terse files: lines without backticks', () => {
		const input = `- files: ${oldRel}\n- files: other.ts\n`;
		const result = rewriteStaleProposalSelfPaths(input, {
			oldRelPath: oldRel,
			newRelPath: newRel,
		});
		expect(result.replacements).toBe(1);
		expect(result.markdown).toContain(`- files: ${newRel}`);
		expect(result.markdown).toContain('- files: other.ts');
	});

	it('does not rewrite narrative mentions outside Files bullets', () => {
		const input = `See also ${oldRel} in the log.\n`;
		const result = rewriteStaleProposalSelfPaths(input, {
			oldRelPath: oldRel,
			newRelPath: newRel,
		});
		expect(result.replacements).toBe(0);
		expect(result.markdown).toBe(input);
	});

	it('is a no-op when old === new or old is empty', () => {
		const input = `- **Files**: \`${oldRel}\`\n`;
		expect(
			rewriteStaleProposalSelfPaths(input, {
				oldRelPath: oldRel,
				newRelPath: oldRel,
			}).replacements,
		).toBe(0);
		expect(
			rewriteStaleProposalSelfPaths(input, {
				oldRelPath: '',
				newRelPath: newRel,
			}).replacements,
		).toBe(0);
	});
});
