---
id: x00273
title: "Guard de push directo a main: cerrar el hueco que el ADR 0018 documenta"
kind: fix
status: done
type: proposal
track: governance
date: 2026-08-29
priority: P1
related:
    - q00011
    - d00013 # ADR que fija la decisión que este guard implementa
shipped-in:
    - 6ff19f8d # S1 guard main + S2 doc + S3 e2e aprobados por revisión por pares
---

# x00273 — Guard de push directo a `main`

## Goal

Ni un humano ni un agente pueden hacer aterrizar un commit en `main`
con un `git push` directo: el único camino es una pull request. Esto
cierra, en el lado que este repo puede controlar sin depender de un
ajuste manual en GitHub, el hueco que documenta el ADR 0018
(`d00013`): hoy no existe **ningún** mecanismo — ni de GitHub, ni
local — que lo impida.

## why

Reproducido en esta sesión (2026-08-29):

1. **GitHub no bloquea el fast-forward.** `gh api
   repos/CartagoGit/mcp-vertex/branches/main/protection` no incluye
   `required_pull_request_reviews` en absoluto — el toggle "Require a
   pull request before merging" nunca se activó. `required_status_checks`
   exige que `ci-complete` esté en verde para el SHA, pero **no** exige
   que ese SHA haya llegado por una pull request: un SHA que ya corrió
   verde en otra rama (p. ej. `wip`) puede hacerse fast-forward
   directamente a `main` sin abrir nunca una PR.

2. **El guard local existente permite `main` explícitamente.**
   `tools/scripts/lint/push-to-develop-discipline.script.ts` documenta
   en su propio comentario de cabecera: *"Pushing to `main` → allowed
   (release flow; versioning is derived on push to `main`)"* — y su
   función `lintPushToDevelop` en efecto nunca examina `remoteBranch
   === 'main'`, solo `remoteBranch === 'develop'`. No hay ningún otro
   script de `tools/scripts/lint/*-discipline*` que cubra `main`.

3. **`GOVERNANCE-BRANCH-PROTECTION.md` ya admite la brecha** ("`required_checks`
   alone does not stop a direct push") pero la resuelve pidiendo activar
   el toggle **para `develop`**, instrucción que el ADR 0018
   (`d00013`) corrige porque contradice la política actual
   (`develop` es deliberadamente flexible; `main` es la que necesita el
   candado).

Sin este guard, la única barrera real contra un push directo a `main`
es la disciplina manual del operador — exactamente el tipo de control
"que depende de la obediencia" que la propia auditoría señala como
patrón repetido a lo largo de todo el informe (Track G, "las reglas
dejan de depender de la obediencia del modelo").

## why this design

El repo ya tiene el patrón exacto que este guard necesita:
`push-to-develop-discipline.script.ts` es un guard de pre-push
config-driven, con función pura testeable
(`lintPushToDevelop`/`lintPrePushStdinUpdates`), lectura del contrato
STDIN real de git (`parsePrePushStdin`, corregido en `x00159` tras
descubrir que el argv de lefthook no lleva el refspec), y el escape
hatch documentado `LEFTHOOK_BYPASS=1`. Extender ESE script para cubrir
también `main`, en vez de crear un script paralelo, evita duplicar la
lectura de STDIN y el parseo de argv que ya está resuelto y testeado.

Se descarta un guard "duro sin escape" (que ni siquiera el bypass
pueda saltarse) porque el repo ya tiene precedente de necesitar una
vía de emergencia auditada — el guard de force-push existente exige
`by` + `reason` no vacíos en vez de prohibir sin excepción. Este guard
sigue el mismo principio: bloqueado por defecto, pero con
`LEFTHOOK_BYPASS=1` disponible para el operador en una emergencia real
(igual que ya lo usan `push-to-develop-discipline` y
`commit-branch-discipline`), no un candado sin llave.

## non-goals

- **Activar "Require a pull request before merging" en GitHub para
  `main`.** Es una acción manual de un operador humano sobre la UI de
  GitHub (documentada en `GOVERNANCE-BRANCH-PROTECTION.md`, corregida
  por `d00013`/S2); el guard local de esta propuesta es la capa que
  **sí** puede aplicarse desde el código, y es complementaria, no
  sustitutiva, de esa acción.
- **Extender `.github/branch-protection.ts` con un campo
  `require_pull_request`.** Quedó fuera de q00011 según su propio
  dependency graph (`x00279` solo cubre `defaults` consumidos, no un
  campo nuevo); si se decide necesario, es una propuesta de
  seguimiento independiente.
- **Bloquear merges de PR en `main` que no cumplan otros requisitos**
  (revisiones, CODEOWNERS). Fuera de alcance — este guard solo
  distingue "llegó por push directo" de "llegó por el flujo de PR".
- **Cambiar el comportamiento del guard para `develop`.** Ese
  comportamiento (bloquear solo a agentes, permitir al operador) ya
  está resuelto por `20c699a9` y no se toca.

## architecture

`tools/scripts/lint/push-to-develop-discipline.script.ts` (se
renombra su rol pero no necesariamente el fichero — ver Slices para la
decisión de nombre) gana una segunda regla en `lintPushToDevelop`:

```ts
if (remoteBranch === MAIN_BRANCH) {
    return {
        ok: false,
        blockers: [
            'pushing directly to `main` — main only receives commits through a pull request (ADR 0018).',
            '',
            'next-action:',
            '  open a pull request from your branch into `main` instead of pushing directly.',
            '',
            '  if this is a true emergency release, bypass:  LEFTHOOK_BYPASS=1 git push ...',
        ],
    };
}
```

Esta comprobación se evalúa **antes** que la de `develop` (un push a
`main` nunca debería colarse por la rama de `develop` del código). El
guard sigue leyendo el STDIN real de git (`parsePrePushStdinUpdates`),
así que cubre correctamente pushes múltiples en la misma invocación
(p. ej. `git push origin wip-branch main` en una sola llamada, si
alguna vez ocurriera).

El fichero se renombra conceptualmente a "protected-branch-discipline"
en su comentario de cabecera (sin romper el script name en
`package.json`/`lefthook.yml`, que sigue siendo
`lint:push-to-develop` por compatibilidad — renombrar el script
también sería un cambio válido pero de mayor alcance de refactor,
fuera de esta propuesta de `fix`).

## Slices

### S1 — Bloquear push directo a `main` en el guard existente

- **Status**: done
- **Files**:
    - `tools/scripts/lint/push-to-develop-discipline.script.ts`
    - `tools/scripts/lint/push-to-develop-discipline.script.spec.ts`
- **Gate**: `bunx vitest run --project tools -- push-to-develop-discipline`
- review-state: done
- review-implementer: falcon
- review-reviewer: delivery_verifier
- review-log: approved by delivery_verifier — Guard main verificado: bloqueo antes de develop, LEFTHOOK_BYPASS=1 funciona, develop sin cambios. 1097 tests + typecheck OK.
### S2 — Corregir el comentario de cabecera y la doc de gobernanza

- **Status**: done
- **Files**:
    - `tools/scripts/lint/push-to-develop-discipline.script.ts`
      (comentario de cabecera: "Pushing to `main` → allowed" pasa a
      describir el nuevo comportamiento bloqueado)
    - `docs/mcp-vertex/GOVERNANCE-BRANCH-PROTECTION.md` (referenciar
      este guard como la capa local complementaria a la config de
      GitHub)
- **Gate**: `bun run lint:docs`
- review-state: done
- review-implementer: owl
- review-reviewer: delivery_verifier
- review-log: approved by delivery_verifier — Comentario y doc de gobernanza verificados: main bloqueado vía PR (ADR 0018), guard local como capa complementaria, sin cambios de comportamiento. lint:content-integrity OK.
### S3 — Test end-to-end del guard real (no solo la función pura)

- **Status**: done
- **Files**:
    - `tools/tests/lint/push-to-develop-discipline.e2e.spec.ts` (nuevo,
      o carpeta equivalente de e2e de `tools/`)
- **Gate**: `bunx vitest run --project tools -- push-to-develop-discipline.e2e`
  — el test simula el STDIN real de un pre-push hook
  (`<local ref> <local oid> refs/heads/main <remote oid>`) invocando
  el script como subproceso (`spawnSync`) y verifica exit code 1 sin
  `LEFTHOOK_BYPASS`, exit code 0 con `LEFTHOOK_BYPASS=1`.
- review-state: done
- review-implementer: crow
- review-reviewer: delivery_verifier
- review-log: approved by delivery_verifier — Verificación independiente: e2e en verde (124 files/1100 tests, exit 0), cumple los 4 criterios de S3. Aprobado.
## dependency graph

Según el dependency graph del plan madre (`q00011`):
`x00278 → x00277 ┐; x00276 ┴ → d00013 → x00273`. Este guard depende de
que `d00013` (el ADR) exista, para citar la decisión escrita en vez de
inventar la política en el mensaje de error del propio script. S1 → S2
→ S3 internamente: el comportamiento se implementa primero, la
documentación se corrige después de que el comportamiento sea real, y
el e2e cierra demostrando el contrato completo (STDIN real +
bypass), no solo la función pura.

## acceptance

1. `git push origin <cualquier-rama>:main` hecho directamente (sin
   pasar por una pull request) es bloqueado por el pre-push hook,
   exit 1, mensaje que cita el ADR 0018 y ofrece el bypass.
2. `LEFTHOOK_BYPASS=1 git push origin <rama>:main` pasa (escape hatch
   preservado, mismo patrón que el resto de guards del repo).
3. Un push a `develop` sigue comportándose exactamente igual que hoy
   (test de no-regresión: la batería existente de
   `push-to-develop-discipline.script.spec.ts` sigue en verde sin
   modificar sus casos de `develop`).
4. El test e2e de S3 demuestra el contrato real de STDIN, no solo la
   función pura `lintPushToDevelop`.
5. `bun tools/scripts/lint/proposals.script.ts` sin errores ni
   warnings sobre este fichero.

## risks and mitigations

- **Riesgo: un release legítimo necesita empujar a `main` sin PR en
  una emergencia real (p. ej. `gh` no disponible, GitHub caído para
  PRs pero no para `git push`).** Mitigación: `LEFTHOOK_BYPASS=1` ya
  es el escape hatch documentado y usado por el resto de guards de
  este repo (`push-to-develop-discipline`, `commit-branch-discipline`)
  — se reutiliza sin inventar un mecanismo nuevo.
- **Riesgo: el guard bloquea el propio merge de una PR** (GitHub
  fusiona una PR haciendo un push interno a `main`, no a través del
  hook local del operador). Mitigación: el pre-push hook es **local**
  — solo se ejecuta cuando alguien corre `git push` desde su propia
  máquina; los merges hechos desde la UI/API de GitHub no pasan por
  lefthook en absoluto, así que no hay conflicto posible.
- **Riesgo: alguien clona el repo sin lefthook instalado y el guard
  nunca se ejecuta.** Riesgo preexistente y compartido con todos los
  demás guards de `lefthook.yml` — no es nuevo de esta propuesta ni se
  resuelve aquí; la mitigación real (branch protection en GitHub) es
  justamente la acción manual pendiente que documenta `d00013`.
- **Riesgo: falso positivo si alguien legítimamente necesita
  `git push origin main` desde una rama llamada `main` local
  (mirror/backup).** Mitigación: el guard mira el **remote branch**
  de destino, no el nombre de la rama local — cubierto explícitamente
  por el test e2e de S3 con un caso de rama local también llamada
  `main`.

## notes

Este guard es deliberadamente asimétrico respecto al de `develop`: en
`develop` solo se bloquea a agentes (`wip/*`, `agent/*`), el operador
puede pushear libremente; en `main` se bloquea a **cualquiera**,
operador incluido, salvo bypass explícito — porque `main` es la rama
de publicación y el ADR 0018 la trata como tal para todos los actores,
no solo para agentes.

Evidencia de la brecha actual, recogida en esta sesión (2026-08-29):

```
$ gh api repos/CartagoGit/mcp-vertex/branches/main/protection | grep -c required_pull_request_reviews
0
$ grep -A2 "Pushing to \`main\`" tools/scripts/lint/push-to-develop-discipline.script.ts
 *   - Pushing to `main` → allowed (release flow; versioning is
 *     derived on push to `main`).
```
