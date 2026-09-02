---
id: d00013
title: "ADR: develop es laboratorio, main es publicación — y qué falta para que el guard lo sostenga"
kind: docs
status: review
type: proposal
track: governance
date: 2026-08-29
priority: P1
related:
    - q00011
    - x00273 # guard de push directo a main — implementación de la decisión que fija este ADR
last-transition-id: a3d342bc-2120-4d90-a2a4-f514accb0aa8
last-correlation-id: a3d342bc-2120-4d90-a2a4-f514accb0aa8
last-transition-from: in-progress
---

# d00013 — ADR: modelo de ramas develop/main

## Goal

Un ADR canónico en `docs/mcp-vertex/adr/0018-branch-model-develop-lab-main-release.md`
que fije por escrito la decisión ya tomada en código (commit
`20c699a9`, "develop is the working branch, main is the protected
one") — `develop` es el laboratorio del operador, sin protección;
`main` es la rama de publicación, protegida — y documente
explícitamente el hueco que queda abierto tras esa decisión: no existe
ningún mecanismo, ni en GitHub ni local, que impida un push directo a
`main` que se salte una pull request.

## why

La auditoría (AUD-A01) registra que la asimetría de gobernanza que
existía en el snapshot inicial (`develop` declarada como protegida en
`.github/branch-protection.ts` pero sin protección real en GitHub) ya
está resuelta por el commit `20c699a9`: `IBranchPolicy` ahora tiene un
flag `protected` por rama, `develop` se declara `protected: false` a
propósito y `main` se declara `protected: true` con
`required_checks: ['ci-complete']`. La propia auditoría reclasifica
esto de BUG a "riesgo de diseño... que sigue abierta": la decisión de
fondo (¿por qué esta asimetría, y qué la sostiene?) nunca quedó
registrada fuera de un mensaje de commit y del propio código.

Verificado en esta sesión (2026-08-29) que la decisión de código no
tiene todavía el mecanismo que la haría irrompible:

1. **GitHub no exige pull request para `main`.** La respuesta real de
   la API para `main` no contiene la clave
   `required_pull_request_reviews` en absoluto:

   ```
   $ gh api repos/CartagoGit/mcp-vertex/branches/main/protection
   {"required_status_checks":{"strict":true,"contexts":["ci-complete"]},
    "enforce_admins":{"enabled":true},"required_linear_history":{"enabled":true},
    "allow_force_pushes":{"enabled":false},"allow_deletions":{"enabled":false}, ...}
   ```

   Sin esa clave, un SHA que ya tenga un `ci-complete` verde (por
   ejemplo, porque corrió en otra rama) puede aterrizar en `main`
   mediante un `git push` directo (fast-forward), sin que exista jamás
   una pull request ni una revisión.

2. **El propio documento de gobernanza ya lo advertía y quedó
   desactualizado.** `docs/mcp-vertex/GOVERNANCE-BRANCH-PROTECTION.md`
   dice textualmente: *"`required_checks` alone does not stop a direct
   push — GitHub's 'Require a pull request before merging' toggle is a
   separate setting with no field in `branch-protection.ts`"* y le
   pide al operador activarlo **para `develop`** — instrucción que
   contradice la decisión posterior (`20c699a9`) de dejar `develop`
   deliberadamente sin protección. El documento nunca se actualizó
   tras esa decisión y hoy da una instrucción incoherente con el
   modelo real.

3. **El guard local existente permite push directo a `main`
   explícitamente.** `tools/scripts/lint/push-to-develop-discipline.script.ts`
   documenta en su propio comentario: *"Pushing to `main` → allowed
   (release flow; versioning is derived on push to `main`)"*. No hay
   ningún guard, ni en lefthook ni en CI, que intercepte un `git push
   origin <rama-cualquiera>:main` hecho a mano.

Sin un ADR que fije la decisión, cualquier sesión futura (agente o
humano) puede volver a "corregir" la asimetría en la dirección
equivocada — exactamente lo que ya ocurrió una vez, según el propio
mensaje de `20c699a9`: *"I got this wrong earlier: I protected develop
and routed everything through pull requests... I changed governance
without reading the backlog."*

## why this design

El repo ya tiene un directorio `docs/mcp-vertex/adr/` con cuatro ADRs
(`0014`-`0017`) siguiendo una plantilla mínima (Status, Date,
Deciders, Context, Decision, Consequences). Esta propuesta sigue esa
misma plantilla en vez de inventar un formato nuevo, y además incluye
una tabla de "Trigger for reversal" (patrón ya usado en `d00012`) para
que la decisión no sea dogma permanente sino condicional a métricas
observables — el propio ADR de contracts (`d00012`) demuestra que este
repo prefiere decisiones reversibles y medibles sobre decisiones
cerradas sin salida.

Se documenta el ADR **antes** de implementar `x00273` (el guard) para
que la implementación tenga una decisión escrita a la que apuntar, en
vez de que el guard sea la única evidencia de la política — mismo
principio que ya aplica `GOVERNANCE-BRANCH-PROTECTION.md` para el
resto de la config declarativa.

## non-goals

- **Decidir si `develop` debería protegerse en el futuro.** El ADR
  documenta la decisión YA TOMADA (`20c699a9`) con su trigger de
  reversión; no reabre el debate.
- **Implementar el guard de push a `main`.** Eso es `x00273`; esta
  propuesta es puramente documental (aunque corrige el documento de
  gobernanza existente, que sí es una edición de contenido, no de
  código).
- **Cambiar `.github/branch-protection.ts` o cualquier script de
  `tools/scripts/ci/`.** Fuera de alcance — territorio de `x00273`.
- **Activar "Require a pull request before merging" en GitHub.** Es
  una acción de un operador humano sobre la UI de GitHub, no algo que
  este ADR ni el código puedan aplicar; el ADR la documenta como
  acción pendiente.

## architecture

### 1. ADR canónico

Ruta: `docs/mcp-vertex/adr/0018-branch-model-develop-lab-main-release.md`.

```md
---
adr_id: 0018
title: "Modelo de ramas: develop es laboratorio, main es publicación"
status: Accepted
date: 2026-08-29
deciders:
  - operador (commit 20c699a9)
  - auditoría independiente Claude Opus 5 (AUD-A01)
supersedes: null
superseded_by: null
related_proposals:
  - x00273
related_audit:
  - docs/mcp-vertex/audits/2026-08-27-develop-independent-audit-claude-opus5.md
---

## Context

(resumen: por qué se protegió develop primero, por qué se revirtió,
qué dice el backlog c00156)

## Decision

`develop` es el laboratorio de trabajo del operador: sin protección de
GitHub, push directo permitido, sin checks obligatorios. Solo se
bloquea que un AGENTE empuje directamente a `develop` (vía
`push-to-develop-discipline.script.ts`) — el trabajo de agentes pasa
por `wip/*` + pull request.

`main` es la rama de publicación: protegida, `ci-complete` obligatorio,
`enforce_admins: true`, historia lineal, sin force-push ni borrado.
Ningún push directo a `main` — humano o agente — está permitido; todo
cambio entra por pull request.

## Consequences

### Positivas
- El operador trabaja sin fricción en su propio repositorio.
- `main` permanece confiable como punto de release.
- La asimetría queda declarada, no es drift silencioso.

### Negativas
- `develop` puede quedar roja indefinidamente sin que ningún gate
  automático lo impida (mitigado por `verify-develop-health`, no por
  branch protection).
- Sin "Require a pull request before merging" en GitHub para `main`,
  un SHA con `ci-complete` verde en otra rama podría aterrizar en
  `main` por fast-forward sin pull request — gap real, cerrado por
  `x00273` + acción manual del operador en GitHub.

## Trigger for reversal

| # | Condición | Métrica | Estado |
|---|-----------|---------|--------|
| 1 | Un segundo contribuyente humano empieza a trabajar en `develop` | número de autores distintos en `git log develop` | medir trimestralmente |
| 2 | `develop` acumula >5 commits consecutivos en rojo | `gh api .../commits/{sha}/check-runs` | bloqueante — reabrir protección de develop |
| 3 | Un push directo a `main` aterriza sin pull request asociada | `gh api .../commits/{sha}/pulls` vacío en un commit de main | bloqueante — investigar el guard |
| 4 | GitHub añade "Require a pull request" con excepción para el propio operador | changelog de GitHub | reevaluar si vale activar sin fricción |

Si el trigger 2 o el trigger 3 se materializan, reabrir `x00273` con
alcance ampliado.
```

### 2. Corrección de `GOVERNANCE-BRANCH-PROTECTION.md`

La sección "Operator playbook" deja de decir "Require a pull request
before merging: ✅ ON for `develop`" (contradice el modelo actual) y
pasa a decir explícitamente que `develop` es deliberadamente flexible
(enlazando al ADR 0018) y que "Require a pull request" solo aplica a
`main`.

### 3. Enlace desde bootstrap

`docs/mcp-vertex/AGENT-BOOTSTRAP.md` añade una línea en la sección
"Architecture decisions" apuntando al ADR 0018, igual que hacen los
ADR 0014-0017 (o su sección equivalente, si "Architecture decisions"
no existe todavía — se crea siguiendo el mismo patrón que `d00012`
describe).

## Slices

### S1 — Crear el ADR (numerado 0019: 0018 fue tomado el mismo día por otro trabajo)

- **Status**: pending
- **Files**:
    - `docs/mcp-vertex/adr/0019-branch-model-develop-lab-main-release.md` (nuevo;
      la propuesta reservaba `0018`, pero `docs/mcp-vertex/adr/0018-managed-lazy-loading-is-all-or-nothing.md`
      lo tomó el 2026-09-02 antes de que este ADR se redactara — ver
      "Numbering note" dentro del propio ADR. `x00273`, ya enviado,
      cita "ADR 0018" en su prosa y en un mensaje de guard real; ambos
      se corrigieron a "ADR 0019" como parte de este slice.)
- **Gate**: `bun tools/scripts/lint/proposals.script.ts` — verde;
  `bun tools/scripts/lint/check-adr-coverage.script.ts` — verde.

### S2 — Corregir `GOVERNANCE-BRANCH-PROTECTION.md`

- **Status**: pending
- **Files**:
    - `docs/mcp-vertex/GOVERNANCE-BRANCH-PROTECTION.md`
- **Gate**: `grep -n "Require a pull request before merging" docs/mcp-vertex/GOVERNANCE-BRANCH-PROTECTION.md`
  debe mostrar la instrucción aplicada a `main`, no a `develop`.

### S3 — Enlace desde AGENT-BOOTSTRAP.md

- **Status**: pending
- **Files**:
    - `docs/mcp-vertex/AGENT-BOOTSTRAP.md`
- **Gate**: no existe un script `lint:docs` en este repo (verificado:
  no aparece en `package.json`); se usó en su lugar
  `bun tools/scripts/lint/bootstrap-canonical.script.ts` (verde: 11
  secciones H2, todas canónicas) y `bun tools/scripts/lint/check-adr-coverage.script.ts`
  (verde) como los gates reales que cubren este fichero.

## dependency graph

Según el grafo de dependencias del plan madre (`q00011`):
`x00278 → x00277 ┐; x00276 ┴ → d00013 → x00273`. Es decir, este ADR se
escribe una vez que los verificadores de branch protection
(`x00276`-`x00278`, AUD-A04/A05/A06) pueden efectivamente demostrar
drift — de lo contrario el ADR estaría documentando una política que
ni siquiera el propio CI puede verificar. `x00273` (el guard de push a
`main`) depende de que este ADR exista, para tener una decisión
escrita que implementar en vez de inventar la política en el propio
código del guard.

S1 → S2 → S3 internamente: el ADR debe existir antes de que
`GOVERNANCE-BRANCH-PROTECTION.md` lo enlace, y ambos antes del enlace
desde `AGENT-BOOTSTRAP.md`.

## acceptance

1. `docs/mcp-vertex/adr/0018-branch-model-develop-lab-main-release.md`
   existe, sigue la plantilla del repo (Status: Accepted, Date,
   Deciders, Context, Decision, Consequences, Trigger for reversal con
   ≥4 condiciones medibles).
2. `GOVERNANCE-BRANCH-PROTECTION.md` ya no instruye activar "Require a
   pull request before merging" para `develop`; la instrucción queda
   correctamente asociada a `main` y enlaza al ADR 0018.
3. `AGENT-BOOTSTRAP.md` enlaza al ADR 0018.
4. `x00273` referencia este ADR en su frontmatter `related:`.
5. `bun tools/scripts/lint/proposals.script.ts` sin errores ni
   warnings sobre este fichero.

## risks and mitigations

- **Riesgo: el ADR documenta una decisión que un futuro reviewer
  externo vuelve a cuestionar sin conocer el contexto de
  `20c699a9`.** Mitigación: el ADR cita el commit y el backlog
  (`c00156`) explícitamente en su sección "Context", y el trigger de
  reversión da una vía formal para reabrir la decisión con evidencia
  en vez de una reversión ad-hoc como la que ya ocurrió una vez.
- **Riesgo: nadie actúa sobre la acción manual pendiente ("Require a
  pull request" en GitHub para `main`).** Mitigación: el trigger 3 de
  la tabla de reversión la convierte en observable — un push directo a
  `main` sin PR asociada es detectable vía `gh api`, y puede
  convertirse en un lint futuro si se repite.
- **Riesgo: bajo impacto real si nadie lee el ADR.** Mitigación:
  enlazado desde `AGENT-BOOTSTRAP.md`, que el propio `CLAUDE.md` del
  repo señala como lectura obligatoria una vez por sesión — el canal
  de mayor visibilidad que existe en este proyecto.

## notes

Evidencia cruda recogida en esta sesión (2026-08-29), no reutilizada
sin volver a correrla:

```
$ gh api repos/CartagoGit/mcp-vertex/branches/main/protection
{"required_status_checks":{"strict":true,"contexts":["ci-complete"]},
 "required_signatures":{"enabled":false},
 "enforce_admins":{"enabled":true},
 "required_linear_history":{"enabled":true},
 "allow_force_pushes":{"enabled":false},
 "allow_deletions":{"enabled":false}, ...}
```

Nótese la ausencia total de la clave `required_pull_request_reviews`
en la respuesta — no es que esté deshabilitada, es que GitHub no la
reporta porque la regla nunca se configuró.
