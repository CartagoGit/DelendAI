import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
	allocateNextProposalId,
	prefixForKind,
} from '@mcp-vertex/proposals/lib/proposals/proposal-id-allocator';

describe('allocateNextProposalId (f00016 S13)', async () => {
	let root = '';
	let counterPathAbs = '';

	beforeEach(async () => {
		root = await mkdtemp(join(tmpdir(), 'id-allocator-'));
		counterPathAbs = join(root, 'proposal-id-counters.json');
	});

	afterEach(async () => rm(root, { recursive: true, force: true }));

	it('seeds from an empty proposalsDir and starts at 1', async () => {
		const id = await allocateNextProposalId('f', {
			proposalsDirAbs: root,
			counterPathAbs,
		});
		expect(id).toBe('f00001');
	});

	it('seeds from disk, taking the max existing number per prefix (legacy + f00016 already there)', async () => {
		await writeFile(join(root, 'l99-feat-multi-model-audit-plugin.md'), '');
		await writeFile(join(root, 'l112-derive-site-manifests.md'), '');
		await mkdir(join(root, 'ready'), { recursive: true });
		await writeFile(
			join(root, 'ready', 'f00016-feat-proposal-state-machine.md'),
			'',
		);
		const id = await allocateNextProposalId('f', {
			proposalsDirAbs: root,
			counterPathAbs,
		});
		// Max f-id on disk is 16, so the next allocation is 17, padded.
		expect(id).toBe('f00017');
		// A different prefix's seed is independent and unaffected.
		const idForX = await allocateNextProposalId('x', {
			proposalsDirAbs: root,
			counterPathAbs,
		});
		expect(idForX).toBe('x00001');
	});

	it('increments sequentially across repeated calls, no gaps', async () => {
		const ids: string[] = [];
		for (let i = 0; i < 5; i++) {
			ids.push(
				await allocateNextProposalId('a', {
					proposalsDirAbs: root,
					counterPathAbs,
				}),
			);
		}
		expect(ids).toEqual(['a00001', 'a00002', 'a00003', 'a00004', 'a00005']);
	});

	it('keeps each prefix on its own independent sequence', async () => {
		const f1 = await allocateNextProposalId('f', {
			proposalsDirAbs: root,
			counterPathAbs,
		});
		const x1 = await allocateNextProposalId('x', {
			proposalsDirAbs: root,
			counterPathAbs,
		});
		const f2 = await allocateNextProposalId('f', {
			proposalsDirAbs: root,
			counterPathAbs,
		});
		expect([f1, x1, f2]).toEqual(['f00001', 'x00001', 'f00002']);
	});

	it('is race-safe: N concurrent calls for the same prefix produce N distinct, sequential ids', async () => {
		const N = 25;
		const results = await Promise.all(
			Array.from({ length: N }, () =>
				allocateNextProposalId('r', {
					proposalsDirAbs: root,
					counterPathAbs,
				}),
			),
		);
		const numbers = results
			.map((id) => Number(id.slice(1)))
			.sort((a, b) => a - b);
		expect(new Set(numbers).size).toBe(N); // no duplicates
		expect(numbers).toEqual(Array.from({ length: N }, (_, i) => i + 1)); // no gaps, sequential
	});

	it('persists the counter file as valid JSON across calls', async () => {
		await allocateNextProposalId('c', {
			proposalsDirAbs: root,
			counterPathAbs,
		});
		await allocateNextProposalId('c', {
			proposalsDirAbs: root,
			counterPathAbs,
		});
		const raw = await readFile(counterPathAbs, 'utf8');
		expect(JSON.parse(raw)).toEqual({ c: 2 });
	});
});

describe('prefixForKind', async () => {
	it('resolves a known kind to its prefix', async () => {
		expect(prefixForKind('feat')).toBe('f');
		expect(prefixForKind('fix')).toBe('x');
		expect(prefixForKind('legacy')).toBe('l');
	});

	it('returns null for an unknown kind', async () => {
		expect(prefixForKind('nonsense')).toBeNull();
	});
});

/**
 * El contador no es la única fuente: el disco manda igual.
 *
 * Las propuestas llegan al árbol por caminos que no pasan por el
 * asignador —creadas a mano, traídas por un merge, escritas por otro
 * agente—, y un contador que no las ha visto reparte un id **que ya
 * existe**.
 *
 * Pasó de verdad: dos `r00005` en el mismo directorio, una de cada
 * agente. El linter del repo destino lo cazó, pero para entonces ya
 * había dos ficheros que renombrar a mano.
 */
describe('el contador atrasado no reparte ids repetidos', async () => {
	let root = '';
	let counterPathAbs = '';

	beforeEach(async () => {
		root = await mkdtemp(join(tmpdir(), 'id-allocator-stale-'));
		counterPathAbs = join(root, 'proposal-id-counters.json');
		await mkdir(join(root, 'ready'), { recursive: true });
	});

	afterEach(async () => rm(root, { recursive: true, force: true }));

	it('no devuelve un id que ya está en disco', async () => {
		// El contador cree que va por 4…
		await writeFile(counterPathAbs, JSON.stringify({ r: 4 }));
		// …pero alguien dejó r00005 en el árbol sin pasar por aquí.
		await writeFile(join(root, 'ready', 'r00005-de-otro-agente.md'), '');

		const id = await allocateNextProposalId('r', {
			proposalsDirAbs: root,
			counterPathAbs,
		});
		expect(id).toBe('r00006');
	});

	it('gana el contador cuando va por delante del disco', async () => {
		// El caso simétrico: una propuesta ya asignada y luego movida o
		// borrada no puede hacer que su id se vuelva a repartir.
		await writeFile(counterPathAbs, JSON.stringify({ r: 9 }));
		await writeFile(join(root, 'ready', 'r00002-vieja.md'), '');

		const id = await allocateNextProposalId('r', {
			proposalsDirAbs: root,
			counterPathAbs,
		});
		expect(id).toBe('r00010');
	});

	it('cada prefijo se reconcilia por su cuenta', async () => {
		await writeFile(counterPathAbs, JSON.stringify({ r: 1, f: 20 }));
		await writeFile(join(root, 'ready', 'r00007-en-disco.md'), '');

		expect(
			await allocateNextProposalId('r', {
				proposalsDirAbs: root,
				counterPathAbs,
			}),
		).toBe('r00008');
		expect(
			await allocateNextProposalId('f', {
				proposalsDirAbs: root,
				counterPathAbs,
			}),
		).toBe('f00021');
	});
});
