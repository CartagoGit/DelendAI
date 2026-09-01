import { describe, expect, it } from 'vitest';

import {
	DEFAULT_PROPOSAL_FOLDER_POLICY,
	proposalFolderFor,
	proposalFoldersForPolicy,
} from '@mcp-vertex/proposals/lib/contracts/proposal-folder-policy';

describe('proposal folder policy', () => {
	it('separates ready and done by kind by default', () => {
		expect(DEFAULT_PROPOSAL_FOLDER_POLICY).toEqual({
			ready: 'by-kind',
			done: 'by-kind',
		});
		expect(proposalFolderFor('ready', 'feat')).toBe('ready/feats');
		expect(proposalFolderFor('done', 'fix')).toBe('done/fixes');
		expect(proposalFolderFor('review', 'feat')).toBe('review');
	});

	it('allows each status to opt into a flat or by-kind layout', () => {
		const policy = {
			ready: 'flat' as const,
			review: 'by-kind' as const,
			done: 'flat' as const,
		};
		expect(proposalFolderFor('ready', 'feat', policy)).toBe('ready');
		expect(proposalFolderFor('review', 'audit', policy)).toBe(
			'review/audits',
		);
		expect(proposalFolderFor('done', 'fix', policy)).toBe('done');
	});

	it('creates kind folders only for statuses configured as by-kind', () => {
		const folders = proposalFoldersForPolicy({
			ready: 'by-kind',
			done: 'flat',
			review: 'by-kind',
		});
		expect(folders).toContain('ready/feats');
		expect(folders).toContain('review/fixes');
		expect(folders).not.toContain('done/feats');
	});

	it('supports selecting only specific kinds for a status', () => {
		const policy = {
			ready: ['audit', 'plan'] as const,
			done: 'flat' as const,
		};
		expect(proposalFolderFor('ready', 'audit', policy)).toBe(
			'ready/audits',
		);
		expect(proposalFolderFor('ready', 'plan', policy)).toBe('ready/plans');
		expect(proposalFolderFor('ready', 'feat', policy)).toBe('ready');
		const folders = proposalFoldersForPolicy(policy);
		expect(folders).toContain('ready/audits');
		expect(folders).toContain('ready/plans');
		expect(folders).not.toContain('ready/feats');
	});
});
