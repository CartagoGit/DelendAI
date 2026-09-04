---
id: f00501
title: "Puente de sólo lectura con Gentle-AI: traducir su configuración de hosts a manifiestos de capacidad"
kind: feat
status: ready
type: proposal
track: general
date: 2026-09-04
related:
    - q00017 # de donde sale esta slice, con su razón
---

# f00501 — Puente de sólo lectura con Gentle-AI

## Goal

Un plugin opt-in, desactivado por defecto, que lea la configuración de
hosts que Gentle-AI ya mantiene y la traduzca a los manifiestos de
capacidad de host de `q00017` S5. **Sólo lectura**: no escribe
configuración de agentes ni instala nada.

## why

Sale de `q00017` S7, y sale por una razón concreta que conviene dejar
escrita en vez de que parezca un descarte.

Los dos proyectos son complementarios y la revisión cruzada del
2026-09-03 lo dice con precisión: Gentle-AI es el plano de configuración
y experiencia —sabe cómo vive cada host: Claude Code, Codex, OpenCode,
Cursor, Gemini, Kiro, Windsurf— y este proyecto es el plano de capacidad
de ingeniería y runtime. Ninguno debe absorber al otro. Un puente formal
es la forma correcta de que la información fluya.

Pero **q00017 no lo necesita para estar completo**. Sus siete criterios de
aceptación son sobre detección políglota, roles ortogonales, la no
contradicción entre `analyzeProject` y el grafo, el guard de divergencia
de manifiestos y los permisos declarados por plugin. Ninguno menciona
Gentle-AI. S7 era la última slice de un plan cuya aceptación ya se cumple
sin ella, y mantenerla dentro habría dejado el plan abierto por trabajo
que no le hace falta.

Y hay un motivo de fondo para no haberla hecho a la carrera: **el formato
en disco de Gentle-AI no es observable desde aquí.** Se conoce la
superficie conceptual de su contrato Adapter —detección, instalación,
directorios, system prompts, skills, configuración, MCP, slash commands,
output styles, subagentes, capacidades— pero no cómo se serializa. Un
adaptador escrito contra un formato adivinado es peor que ninguno: parece
terminado, se lee como autoridad, y falla en silencio contra la realidad.

La revisión externa del 2026-09-04 llega a la misma conclusión por otra
vía: «terminar S7 de q00017/Gentle-AI solo si realmente aporta valor; no
lo pondría por delante de los anteriores».

## non-goals

- NO fusiona Gentle-AI dentro de este proyecto ni al contrario.
- NO escribe nada en la configuración del usuario ni instala agentes.
- NO adivina el formato en disco de Gentle-AI: si la forma real no se
  puede confirmar, el plugin no se activa.

## Architecture

El puente se parte en dos piezas con responsabilidades distintas, y esa
partición es lo que permite construir la mitad útil hoy:

1. **La traducción** — una función pura de un descriptor de host de
   Gentle-AI a `IHostCapabilityManifest`. La semántica es conocida y
   estable: sus «capacidades» por agente mapean a `mcp.*`, sus «skills» a
   `skills`, sus «subagentes» a `subagents`. Se puede escribir, probar con
   fixtures y revisar sin tener el fichero delante.

2. **El lector** — lo que localiza y parsea la configuración real. Es lo
   que depende del formato, y es lo que no se puede escribir a ciegas.

El plugin declara el contrato de entrada que consume, de modo que
confirmar la forma real más adelante sea un mapeo de una pieza y no una
reescritura.

## Slices

- global_gate: validate

### S1 — La traducción, pura y con fixtures
- **Status**: pending
- **Files**: `plugins/gentle-ai/package.json`, `plugins/gentle-ai/src/lib/contracts/interfaces/gentle-host.interface.ts`, `plugins/gentle-ai/src/lib/services/translate-host.service.ts`, `plugins/gentle-ai/tests/src/lib/services/translate-host.service.spec.ts`
- **Gate**: validate

El descriptor de entrada que aceptamos, declarado explícitamente, y la
función pura que lo proyecta a `IHostCapabilityManifest`. Fixtures para
los hosts que la revisión cruzada nombra.

Un descriptor que declare una capacidad que nuestro manifiesto no
contempla debe **fallar de forma visible**, no caer al valor más cercano:
decir que un host soporta subagentes cuando no se sabe es la clase de
mentira que el llamador no puede ver.
- acceptance:
  - "`translateGentleHost` es pura y no toca el sistema de ficheros."
  - "Existe un fixture por cada host nombrado en la revisión cruzada, y cada uno produce un `IHostCapabilityManifest` válido."
  - "Una capacidad desconocida produce un error explícito, nunca una aproximación."

### S2 — El lector, sólo cuando la forma real esté confirmada
- **Status**: blocked — requiere observar un fichero de configuración real de Gentle-AI
- **DependsOn**: [S1]
- **Files**: `plugins/gentle-ai/src/lib/services/read-gentle-config.service.ts`, `plugins/gentle-ai/tests/src/lib/services/read-gentle-config.service.spec.ts`
- **Gate**: validate

Localiza y parsea la configuración real. Bloqueada a propósito: sin un
ejemplo del fichero, cualquier parser es una conjetura con forma de
código.

Se desbloquea con una sola cosa: un fichero de configuración de Gentle-AI
de verdad, o su esquema publicado.
- acceptance:
  - "El lector se prueba contra un fichero real o un esquema publicado, no contra una forma inventada."
  - "El plugin sigue desactivado por defecto."

### S3 — Registro del plugin, opt-in
- **Status**: pending
- **DependsOn**: [S1]
- **Files**: `plugins/gentle-ai/src/index.ts`, `plugins/gentle-ai/tests/src/index.spec.ts`
- **Gate**: validate

Registra el plugin, desactivado por defecto, exponiendo la traducción. Sin
el lector de S2 sólo acepta descriptores que el host le entregue, lo cual
ya es útil para un host que quiera declarar sus capacidades sin que
tengamos que descubrirlas.
- acceptance:
  - "El plugin está desactivado por defecto y no lee nada del sistema del usuario al registrarse."
  - "Con S2 bloqueada, el plugin sigue siendo útil: traduce un descriptor entregado por el host."

## Acceptance

- La traducción existe, es pura, está probada con fixtures y no depende
  del formato en disco.
- El plugin no escribe nada en la configuración del usuario, en ninguna
  ruta del código.
- Nada del puente se activa por defecto.
- Ninguna parte del puente afirma conocer un formato que no se ha
  observado.

## Risks and mitigations

- **Riesgo: solapamiento de autoridad.** Dos sistemas que creen mandar
  sobre la configuración de un host se pisan. **Mitigación**: el puente es
  de sólo lectura por construcción, no por convención — no hay ninguna
  ruta de escritura que desactivar.
- **Riesgo: la forma adivinada se convierte en la forma oficial.** Un
  adaptador escrito contra un formato inventado se lee como autoridad.
  **Mitigación**: S2 está bloqueada explícitamente hasta que haya un
  fichero real, y S1 declara el contrato que consume en vez de suponerlo.
