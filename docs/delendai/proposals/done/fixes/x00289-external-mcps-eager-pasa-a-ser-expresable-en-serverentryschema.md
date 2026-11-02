---
id: x00289
title: "external-mcps: `eager` pasa a ser expresable en `ServerEntrySchema`"
kind: fix
status: done
type: fix
track: security
date: 2026-08-29
parent-plan: q00011
audit-source:
    file: docs/mcp-vertex/audits/2026-08-27-develop-independent-audit-claude-opus5.md
    finding: AUD-D03
    snapshot: 2cf17373f32b536e0c5154892ceddbb5d490ab37
priority: P1
shipped-in:
    - 0e61564 # S1 eager en schema + bootEager probado + S2 contrato schema↔registry
related: [q00011, x00290]
---

# x00289 — `external-mcps`: `eager` pasa a ser expresable en `ServerEntrySchema`

## Goal

Que un usuario pueda declarar `"eager": true` en un servidor de
`plugins.external-mcps` en `mcp-vertex.config.json` y que arranque en
el `init` del plugin, en vez de recibir un error de validación por
clave desconocida. Añadir además un test de contrato que compare, por
construcción, las claves de `ServerEntrySchema` (Zod) con las del tipo
`IRegistryServerEntry` del registry, para que esta clase de deriva
contrato↔implementación no pueda volver a colarse en silencio.

## why

**Comportamiento verificado independientemente en esta sesión (no se
da por buena la cita del audit sin comprobarla).**

- `plugins/external-mcps/src/lib/options-schema.ts:96-123` —
  `ServerEntrySchema` es un `z.object({ enabled, version, command,
  args, namespacePrefix, detect, env })` cerrado con `.strict()` en
  la línea 123. **No declara `eager`.**
- `plugins/external-mcps/src/lib/subprocess/server-registry.ts:297`
  — `IRegistryServerEntry` extiende `Omit<IServerEntry, 'env'>` y
  añade `readonly eager?: boolean;`. El comentario de la línea 282
  dice literalmente *"`eager` is registry-level"* — el propio código
  documenta el desacople entre lo que el registry consume y lo que el
  schema de config permite escribir.
- `server-registry.ts:420-423` — `bootEager()` recorre
  `this.servers` y llama a `this.ensureBooted(id)` para todo
  `entry.eager === true`.
- `plugins/external-mcps/src/index.ts:80-81` — el `init` del plugin
  llama a `registry.bootEager()` incondicionalmente.

El hallazgo se sostiene exactamente como lo describe `AUD-D03`, sin
matices que corregir: `eager` está implementado, se ejecuta en cada
arranque, y **ningún** camino soportado (el `mcp-vertex.config.json`
validado por Zod) permite activarlo. Reproducción confirmada:
cualquier entrada con `"eager": true` en `servers.<id>` falla la
validación de `ServerEntrySchema` por clave no reconocida (`.strict()`),
así que `bootEager()` es hoy, en la práctica, siempre un no-op.

**Por qué es un problema.** Es funcionalidad completa —tipo, consumo
en el registry, llamada en el arranque del plugin— a la que no existe
ruta de entrada del usuario. Peor: un lector del código
(`bootEager`, el campo `eager?` en el tipo del registry) concluye
razonablemente que el arranque eager es una opción soportada hoy.

## why this design

La solución mínima —añadir la clave al schema— es obligatoria en
cualquier caso porque es lo único que resuelve el bug reportado. Se
añade además el test de contrato (S2) porque el propio origen del
bug es estructural: nada obliga a que el schema de configuración y el
tipo que consume el registry compartan claves, así que la misma clase
de bug puede repetirse con el próximo campo nuevo del registry. Un
test que compare las claves de ambos por construcción (no una lista
mantenida a mano, que se desincroniza igual que el schema) cierra la
categoría entera, no solo esta instancia.

Arrancar un subproceso de terceros en el `init` del servidor MCP, sin
llamada explícita del usuario, es una superficie con implicaciones de
seguridad distintas de la activación lazy por defecto (arranca en el
primer uso de una tool del servidor) — por eso el default de `eager`
se mantiene en `false` y la documentación de la clave debe explicitar
esa diferencia, no solo su forma.

## non-goals

- Cambiar el comportamiento de `bootEager()` en sí — el registry ya
  hace lo correcto; el bug está enteramente en que el schema no deja
  llegar el valor.
- `llmDecidesActivation` y la política de activación real — es
  `x00290` (`AUD-D04`), un hallazgo distinto sobre el mismo plugin.
- Migrar `IServerEntry`/`IRegistryServerEntry` a un único tipo
  generado desde el schema Zod (`z.infer` + registry-only fields por
  intersección) — sería la solución arquitectónica más profunda, pero
  excede el alcance de un fix P1; el test de contrato de S2 da la
  misma garantía de forma más barata y sin tocar la forma del tipo
  del registry que otros ficheros ya importan.

## architecture

`ServerEntrySchema` gana `eager: z.boolean().default(false)` junto al
resto de claves booleanas ya presentes (`enabled`), documentado en un
comentario que explique la diferencia de seguridad frente al arranque
lazy. `IServerEntry` (el tipo inferido, `options-schema.ts:171`) pasa
automáticamente a incluir `eager: boolean` — no requiere tocar
`server-registry.ts`, que ya declara `eager?: boolean` de forma
compatible (opcional en el registry, con default en el schema de
config).

El test de contrato (S2) vive en
`plugins/external-mcps/tests/src/lib/schema-registry-contract.spec.ts`
(nuevo) y hace, en TypeScript puro (sin I/O, coherente con el resto
de `options-schema.ts`):

```ts
type SchemaKeys = keyof z.infer<typeof ServerEntrySchema>;
type RegistryKeys = keyof IRegistryServerEntry;
// Assertion de tipo: SchemaKeys y RegistryKeys deben ser el mismo
// conjunto salvo por las claves registry-only documentadas
// explícitamente (hoy ninguna adicional, tras esta propuesta).
```

Como Zod no expone una forma runtime-inspeccionable 1:1 sin recurrir a
`._def.shape()` (frágil entre versiones de Zod), el test de contrato
combina una comprobación runtime de las claves de
`ServerEntrySchema.shape` con una comprobación de tipo (`expectTypeOf`
o un helper `AssertKeysMatch<A, B>`) para la mitad estática del
contrato, evitando depender de internals de Zod más allá de `.shape`
(ya usado en otros tests del repo).

## slices

### S1 — `eager` expresable en el schema + arranque probado

- **Status**: done
- **Files**:
    - `plugins/external-mcps/src/lib/options-schema.ts`
      (`eager: z.boolean().default(false)` + comentario de
      implicaciones de seguridad)
    - `plugins/external-mcps/tests/src/lib/options-schema.spec.ts`
      (spec: `eager: true` valida; spec: `eager` ausente ⇒ `false`)
    - `plugins/external-mcps/tests/src/lib/subprocess/server-registry.spec.ts`
      (spec: con un spawner falso, un servidor `eager: true` en la
      config de entrada arranca en `bootEager()`; uno `eager: false`
      u omitido no arranca hasta el primer uso)
- **Gate**: `bunx vitest run --project external-mcps`
- review-state: done
- review-implementer: finch
- review-reviewer: delivery_verifier
- review-log: approved by delivery_verifier — Verificación independiente en el checkout actual: el schema expresa eager con default false, el arranque eager se cablea vía registry.bootEager y los tests cubren que solo eager:true arranca al boot mientras eager:false u omitido siguen lazy. No observé bloqueadores externos del slice en plugins/external-mcps.
### S2 — Test de contrato schema ↔ registry

- **Status**: done
- **Files**:
    - `plugins/external-mcps/tests/src/lib/schema-registry-contract.spec.ts` (nuevo)
- **Gate**: `bunx vitest run plugins/external-mcps/tests/src/lib/schema-registry-contract.spec.ts`
- review-state: done
- review-implementer: falcon
- review-reviewer: delivery_verifier
- review-log: approved by delivery_verifier — Verificacion independiente en el checkout actual: el contrato compara las claves del shape del schema contra un mapa tipado del registry, de modo que cualquier deriva schema↔registry falla en runtime y compile time; el test comportamental confirma que bootEager solo arranca eager:true y deja eager:false/omitido en frio hasta la primera llamada. Revise tambien el diff actual de plugins/external-mcps y no observe cambios fuera del slice que bloqueen la aprobacion.
## dependency graph

Sin dependencias con otras propuestas del plan (`AUD-D03` está
marcado "Dependencias: Ninguna" en el propio informe). En el grafo de
`q00011`, `x00290 ──► x00289` está declarado como orden sugerido
(ambos tocan `external-mcps`, conviene no correr en paralelo sobre el
mismo árbol para evitar conflictos de merge), no como dependencia de
diseño: esta propuesta no requiere que `x00290` esté implementada
primero.

## acceptance

- `"eager": true` en un servidor de `mcp-vertex.config.json` valida
  contra `ServerEntrySchema` sin error.
- Con un spawner falso, un servidor `eager: true` arranca durante
  `init()` del plugin (probado en S1).
- `eager` ausente preserva el comportamiento actual: arranque
  perezoso en el primer uso.
- El test de contrato de S2 falla si alguien añade un campo a
  `IRegistryServerEntry` sin reflejarlo en `ServerEntrySchema` (o
  viceversa, para las claves compartidas).

## risks and mitigations

- **Riesgo: un usuario que ya tenía `"eager": true` en su config
  (rechazada hasta ahora por `.strict()`) obtiene, tras el fix, un
  arranque eager que no esperaba activo.** Mitigación: es
  imposible por construcción — una config con esa clave nunca pasaba
  la validación antes de este fix, así que ningún despliegue
  existente puede tener `eager: true` vigente hoy.
- **Riesgo: el test de contrato de S2 se vuelve frágil si Zod cambia
  la forma interna de `.shape`.** Mitigación: `.shape` es API pública
  estable de Zod (no `._def`), usada así en otros tests del monorepo;
  si Zod la deprecara, el fallo del test es visible en CI, no
  silencioso.

## notes

Compatibilidad: aditiva — `eager` con default `false` no cambia el
comportamiento de ninguna config existente (todas las que no
declaraban la clave seguían arrancando lazy, y siguen haciéndolo).

Ficheros de referencia:

- `plugins/external-mcps/src/lib/options-schema.ts:96-123`
- `plugins/external-mcps/src/lib/subprocess/server-registry.ts:282,297,420-423`
- `plugins/external-mcps/src/index.ts:80-81`
