---
id: x00524
title: "Eliminar artefacto de plugin externo y documentar la adaptación host-neutral"
kind: fix
status: ready
type: proposal
track: architecture
date: 2026-09-07
---

# x00524 — Eliminar artefacto de plugin externo y documentar la adaptación host-neutral

## Goal

Eliminar el directorio fantasma generado bajo plugins/ y dejar una propuesta canónica que describa qué ideas de un proyecto externo se adaptan a delendai como capacidades propias, sin copiar código, nombres, formatos ni crear una integración externa.

## why

Un directorio plugins/gentle-ai/ contiene únicamente un AGENT.md generado por el escáner de plugins, pero no representa un plugin funcional ni tiene package.json. Su mera presencia hace que los generadores, manifiestos y verificaciones lo traten como plugin de primera parte y provoca errores como ENOENT durante release-plan. La intención correcta es incorporar ideas útiles dentro de las abstracciones existentes de delendai y documentar esa decisión en una propuesta.

## non-goals

- No crear un plugin con el nombre del proyecto externo.
- No copiar código, nombres, formatos de configuración ni estructura de otro proyecto.
- No añadir una dependencia, puente de compatibilidad ni instalador externo.
- No introducir una segunda memoria, workflow, router de modelos o sistema paralelo de agentes.

## Slices

- global_gate: type

### S1 — Retirar el plugin fantasma generado
- **Status**: done
- **Files**: `plugins/gentle-ai/`
- **Gate**: none
- acceptance:
  - "El directorio plugins/gentle-ai deja de existir."
  - "El generador de AGENT.md ya no lo descubre como plugin."
  - "No queda ninguna referencia activa al nombre externo en fuentes, configuración o manifiestos."

### S2 — Consolidar la documentación de adaptación host-neutral
- **Status**: pending
- **Files**: `docs/delendai/proposals/ready/x00524-eliminar-artefacto-de-plugin-externo-y-documentar-la-adaptacion-host-neutral.md`
- **Gate**: type
- acceptance:
  - "La propuesta enumera explícitamente las ideas adaptadas: capacidades host-neutrales, perfiles declarativos, adapter packs deterministas, separación detección/autorización, y guards de deriva."
  - "La propuesta deja claro que la implementación vive en contratos, registro y superficies existentes de delendai."
  - "La propuesta declara como no objetivos copiar código, nombres, formatos o workflows externos."

## Adaptación host-neutral

Las ideas que se conservan se expresan como capacidades propias de delendai:

- **Capacidades host-neutrales**: contratos y superficies que no dependen de un IDE, proveedor o runtime concreto.
- **Perfiles declarativos**: configuración validada que describe intención y límites sin acoplar el comportamiento a un host externo.
- **Adapter packs deterministas**: adaptadores pequeños, versionados y reproducibles que traducen capacidades del host a contratos del sistema.
- **Separación detección/autorización**: detectar una capacidad no concede permiso para ejecutarla; la autorización permanece en las políticas y guards existentes.
- **Guards de deriva**: comprobaciones que detectan divergencias entre contratos, registro, manifiestos generados y runtime antes de publicar o ejecutar.

La implementación vive en los contratos, el registro y las superficies existentes de delendai. Esta propuesta documenta una decisión de arquitectura y no introduce una integración paralela.

## acceptance

- El directorio plugins/gentle-ai deja de existir.
- El generador de AGENT.md ya no lo descubre como plugin.
- No queda ninguna referencia activa al nombre externo en fuentes, configuración o manifiestos.
- La propuesta enumera explícitamente las ideas adaptadas: capacidades host-neutrales, perfiles declarativos, adapter packs deterministas, separación detección/autorización, y guards de deriva.
- La propuesta deja claro que la implementación vive en contratos, registro y superficies existentes de delendai.
- La propuesta declara como no objetivos copiar código, nombres, formatos o workflows externos.
