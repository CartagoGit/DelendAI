---
id: r00052
title: "El ratchet de file-conventions crecio de 349 a 424 porque a la convencion le faltan roles reales del repositorio (repository, adapter, migration, facade)"
kind: refactor
status: done
type: proposal
track: architecture
date: 2026-09-08
shipped-in:
  - "72c882786"
closed-by: evidence pass 2026-09-15
closed-evidence:
  - 72c882786 roles repository, facade, driver and store, each classifying at least three real files nothing else did; .migrator.ts classified as migration outside migrators/
  - file-conventions baseline 437 -> 403, written with --write-baseline, which refuses growth against the committed file (c00529)
  - deviation: no adapter role; every *-adapter.ts is already classified, so the rule would classify nothing (third acceptance bullet)
---

# r00052 — El ratchet de file-conventions crecio de 349 a 424 porque a la convencion le faltan roles reales del repositorio (repository, adapter, migration, facade)

## Goal

Que los ficheros que hoy estan en el baseline por no encajar en ningun rol pasen a encajar por REGLA, y que el ratchet vuelva a bajar en vez de subir.

## why

Al implementar f00533 el gate lint:file-conventions estaba en rojo con 75 ficheros no clasificados por encima del baseline de 349, y la mayoria no eran del trabajo en curso: packages/context-compiler/src/lib/*, packages/state-sqlite/src/lib/{registry-facade,fail-closed,error-method,sqlite-driver}.ts, los trece packages/proposals-sqlite/src/lib/{reconciler-*,repository/*-repo}.ts, packages/core/src/lib/dispatch/capability-resolver*.ts y packages/core/src/lib/workspace-migration/**. El gate llevaba tiempo rojo, y un ratchet permanentemente rojo no detecta nada. Se ha refrescado el baseline a 424 para que vuelva a detectar deriva nueva, pero eso es aceptar deuda, no resolverla. La causa real no es que esos ficheros esten mal nombrados: es que la union Role de packages/core/src/lib/contracts/file-conventions.contract.ts (interface, constant, service, tool, registry, register, factory, builder, generated, test, config, script, command, provider, view, component, page, i18n, data, dev) no contempla patrones que el repositorio usa de forma sistematica y deliberada. El caso mas claro es repository/<entidad>-repo.ts, que aparece siete veces en proposals-sqlite y es una convencion consciente, no un descuido. Renombrar setenta y cinco ficheros para encajar en roles que no describen lo que son seria peor que ampliar la ontologia.

## non-goals

- No renombrar ficheros en masa para que encajen a la fuerza en un rol existente.
- No eliminar el ratchet: sigue siendo util para lo que de verdad esta sin clasificar.
- No tocar la convencion de tests, que ya funciona.

## Slices

- global_gate: lint

### S1 — ampliar la ontologia de roles con los patrones que el repositorio ya usa
- **Status**: done — `72c882786`. Added `repository` (10 unclassified `*-repo.ts`, nine in `proposals-sqlite/repository/`), `facade` (4), `driver` (7 SQLite drivers) and `store` (5), each pinned in `file-conventions.contract.spec.ts` against the real files that motivated it. `migration` already existed; its rule now also classifies `*.migrator.ts` outside `migrators/`. The new rules sit at the end of the chain, so no file that already had a role changes it (the `work-model/*-repo.ts` files stay `engine`). **Deviation:** no `adapter` role. All 7 `*-adapter.ts` files are already classified, so the rule would classify nothing, which the third acceptance bullet forbids. Verified 2026-09-15.
- **Files**: `packages/core/src/lib/contracts/file-conventions.contract.ts`, `packages/core/tests/src/lib/contracts/file-conventions.contract.spec.ts`
- **Gate**: type
- acceptance:
  - "La union Role incorpora los roles que faltan, justificados uno a uno por ficheros reales del arbol: al menos repository (<algo>-repo.ts), adapter, migration y facade (<algo>.facade.ts)."
  - "Cada rol nuevo lleva una regla en DEFAULT_TS_RULES y un test que fija que clasifica los ficheros reales que motivaron el rol."
  - "Ningun rol se anade sin al menos tres ficheros reales que lo justifiquen; la ontologia describe el repositorio, no lo contrario."

### S2 — bajar el baseline aplicando las reglas nuevas
- **Status**: done — `72c882786`. Baseline 437 → 403 (it read 424 when this proposal was written). `--write-baseline` refuses to write a larger baseline than the committed file unless given `--allow-baseline-growth` and a `--reason` (c00529). `lint:file-conventions` is green. Verified 2026-09-15.
- **DependsOn**: [S1]
- **Files**: `tools/scripts/lint/file-conventions.baseline.json`, `tools/scripts/lint/file-conventions.script.ts`
- **Gate**: lint
- acceptance:
  - "El baseline baja de 424 a un numero estrictamente menor y la propuesta registra la cifra exacta alcanzada."
  - "El script falla si el baseline CRECE respecto al fichero versionado, no solo si aparecen ficheros nuevos: un ratchet que solo sube no es un ratchet."
  - "lint:file-conventions pasa en verde."

## acceptance

- La union Role incorpora los roles que faltan, justificados uno a uno por ficheros reales del arbol: al menos repository (<algo>-repo.ts), adapter, migration y facade (<algo>.facade.ts).
- Cada rol nuevo lleva una regla en DEFAULT_TS_RULES y un test que fija que clasifica los ficheros reales que motivaron el rol.
- Ningun rol se anade sin al menos tres ficheros reales que lo justifiquen; la ontologia describe el repositorio, no lo contrario.
- El baseline baja de 424 a un numero estrictamente menor y la propuesta registra la cifra exacta alcanzada.
- El script falla si el baseline CRECE respecto al fichero versionado, no solo si aparecen ficheros nuevos: un ratchet que solo sube no es un ratchet.
- lint:file-conventions pasa en verde.
