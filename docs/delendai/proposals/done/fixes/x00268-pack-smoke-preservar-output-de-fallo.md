---
id: x00268
title: "Pack smoke: preservar output de fallo"
kind: fix
status: done
type: proposal
track: ci
date: 2026-08-25
priority: P1
classification: CONFIRMADO
parent-plan: q00006
shipped-in: [7cc8c1650567ca959411e1bc0554b6b4bbaf923b]
audit-source:
    file: docs/mcp-vertex/audits/legacy/2026-08-25-develop-external-audit-chatgpt-sol-cuarta-pasada.md
    section: "Track G / x00268"
    sha256: 2374da0f620dc2cfab21e0d435e143f10174731864efce9f26f2d3a00104232a
related:
    - q00006
    - c00139 # tier 3 corre pack smoke
    - v00126 # verify CI local repro
---

# x00268 — Pack smoke: preservar output de fallo

## Goal

Hacer que el job "pack smoke" de GitHub Actions **preserve el
output completo** cuando un step falla, en lugar de comérselo por
un `set -euo pipefail` mal combinado con command substitution.

### Comportamiento actual (BUG)

- El script de pack smoke usa `set -euo pipefail` y captura el
  output de un comando en una variable:
  ```bash
  set -euo pipefail
  output=$(some_failing_command 2>&1)
  echo "$output"
  ```
- Cuando `some_failing_command` falla, `set -e` aborta el script
  **antes** de que `echo "$output"` corra.
- El log del job muestra solo el error genérico, no el output del
  comando que falló.
- La auditoría externa (§32) lo marca como bug confirmado: el job
  de diagnóstico no diagnostica nada porque oculta su propia
  evidencia.

### Comportamiento deseado

- El script captura el output en un archivo temporal **incluso si
  el comando falla**:
  ```bash
  set +e
  output_file=$(mktemp)
  some_failing_command >"$output_file" 2>&1
  rc=$?
  set -e
  echo "::group::pack-smoke output"
  cat "$output_file"
  echo "::endgroup::"
  rm -f "$output_file"
  if [ $rc -ne 0 ]; then
    echo "::error::pack-smoke failed with exit $rc"
    exit $rc
  fi
  ```
- GitHub Actions collapsible groups (`::group::` / `::endgroup::`)
  para que el output sea visible pero no ruidoso.
- Exit con el código real para que GitHub Actions marque el step
  como fallido.

## why

- Cumple R6: cerrar con evidencia. Si el job falla, la evidencia
  debe estar disponible.
- Cierra §32 de la auditoría.
- Habilita `v00126` (verify CI local repro) — el developer que
  intenta reproducir localmente necesita el output tal cual fue.

## non-goals

- No reescribe todo el workflow de pack smoke, solo el step de
  captura.
- No cambia la lógica del test (solo cómo se captura su output).
- No añade retry al comando.
- No introduce un sink externo (R1.9).

## architecture

### 1. Refactor del script

- `tools/scripts/ci/pack-smoke.script.ts` (o equivalente):
  - Cambiar `set -euo pipefail` a `set -eu` (sin pipefail, porque
    pipefail combinado con captura es problemático).
  - Capturar output con `mktemp`.
  - Imprimir siempre el output con `::group::`.
  - Exit con `$?` del comando original.

### 2. Tests

- `tools/scripts/ci/pack-smoke.spec.ts`:
  - Mock un comando que falla; verifica que el output del comando
    aparece en stdout.
  - Verifica que exit code es el del comando original.

### 3. Verificación manual

- Hacer fallar pack smoke en una rama de prueba; verificar en
  GitHub Actions que el output aparece en el log.

## Slices

### S1 — Refactor del script pack-smoke + tests

- **Status**: done
- **Files**: `tools/scripts/ci/pack-smoke.script.ts`, `tools/scripts/ci/pack-smoke.spec.ts`, `.github/workflows/pack-smoke.yml`
- **Gate**: type
- review-state: done
- review-implementer: owl
- review-reviewer: delivery_verifier
- review-log: approved by delivery_verifier — Verificacion independiente (revisor != owl): pack-smoke.script.ts preserva el output en ::group::/::endgroup:: y retorna el exit code real del comando; spec focalizado 3/3 verde; Biome y git diff --check limpios sobre los archivos S1. El typecheck global/scope falla solo por errores preexistentes en 31 archivos ajenos al slice.
## acceptance

- Script refactorizado preserva output en `::group::`.
- Exit code correcto.
- Tests verdes.
- Verificación manual: un fallo de pack smoke deja output visible
  en GitHub Actions.
- Sin cambios en la lógica del test.
