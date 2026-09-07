import type { IReconcilerInputFile } from '../../src';

export const largeProposalSet = (): readonly IReconcilerInputFile[] =>
	Array.from({ length: 60 }, (_, index) => {
		const number = String(index + 1).padStart(5, '0');
		return {
			path: `ready/fixes/x${number}-fixture.md`,
			sha: `blob-x${number}`,
			raw: `---
id: x${number}
title: Fixture proposal ${number}
kind: fix
status: ready
type: proposal
track: architecture
---
# Fixture proposal ${number}

Deterministic rebuild fixture entry ${number}.
`,
		};
	});
