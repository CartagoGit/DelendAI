# Auditoría independiente de DelendAI — checkpoint de la primera tanda

**La auditoría sigue abierta.** No se han agotado las fichas de plugins ni la lectura de todos los subsistemas. Este artefacto permite continuar sin repetir los experimentos ni confundir inventario con cobertura verificada.

Auditor: **gpt-6.1-sol**, identidad observada por el puente del host; Codex. Fecha de cliente: **19 de octubre de 2026, Europe/Madrid**. Los tres subagentes inspeccionan el mismo modelo: no cuentan como revisores independientes adicionales.

Snapshot único: **`514758e783620c8953079be4d71fceccacb3de8b`**, coincidente con develop local/remoto al inicio. No se proporcionó otro SHA común por el coordinador; los informes previos usan otros snapshots y se identifican como tales en el contraste. La copia fuente se obtuvo con git archive; dependencias instaladas enlazadas, sin instalación limpia.

## Resultados guardados

- [22 hallazgos confirmados](finding-index.md): 6 P1, 15 P2 y 1 P3; ningún P0 demostrado. Código, comportamiento esperado/real, reproducción, límites, causa y regresión en los informes enlazados.
- [Concurrencia y Batuta](concurrency-batuta.md), [core/CLI/migraciones/CI](core-cli-migrations.md), [UI/red/tokens](ui-security-tokens.md) y [escáneres/configuración](independent-scanners.md). Toda la evidencia es local o simulada; se diferencia cada modalidad. No se modificó producto, ni se invocaron proveedores reales, ni se leyeron credenciales/cuotas privadas.
- [Contraste D1/D2 y otras afirmaciones](contrast.md): el mutex exterior existe; no se confirma la carrera alegada para la cadena pública. Se demuestra un defecto distinto al refrescar la misma taskId por otro agente. Tres rondas con purga y claims disjuntos, dos procesos por ronda, conservaron las dos claims.
- **1351 tests focales aprobados en 201 archivos**, suma de suites acotadas disjuntas; no equivale a validate completo. El preflight general de tests se detuvo a 180 s. Build global inicial limitado por reconstrucción de tipos de database; build focal restaurando el enlace instalado pasó. Biome directo falló, sin concluir nada sobre wrapper de baseline. Logs conservados.
- [Comparación de las tres superficies](token-comparison.md): mismo objetivo de lectura, ciclo MCP completo medido. Managed/adaptive requieren más llamadas y transmiten menos bytes en ese escenario. Faltan tokens reales, conversación del host, relists automáticos y factura: no se declara ahorro económico end-to-end.

## Inventario y cobertura

| Artefacto | Qué demuestra |
|---|---|
| [snapshot.json](snapshot.json), [git-paths.txt](git-paths.txt) | 8866 paths versionados, 942104 líneas físicas .ts, alcance y SHA |
| [files.json](files.json) | Ruta, bytes y SHA-256 de cada archivo; inventariado no implica inspeccionado |
| [components.json](components.json), [coverage.tsv](coverage.tsv) | 84 manifiestos incluyendo root/tools/ejemplos/fixtures, dependencias y specs por componente |
| [plugins.json](plugins.json), [fichas](plugin-cards.md) | 61 plugins directos, 17 con inspección parcial y 44 aún pendientes; 14 notas provisionales de alcance limitado, no notas globales |
| [coverage-scope.json](coverage-scope.json) | Resultado y límite por cadena/subsistema |
| [catalog-tools.json](catalog-tools.json), [tool-registration-sites.json](tool-registration-sites.json) | 257 entradas del catálogo generado versionado y 345 sitios léxicos registerTool; no son la superficie efectiva completa |
| [proposals.json](proposals.json), [activas](active-proposals.md) | 1243 propuestas y 6 índices; 21 activas con aceptación declarada, contraste completo pendiente |
| [prior-findings.json](prior-findings.json) | 62 hallazgos anteriores individualizados; no verificados conservan pendiente |
| [Arquitectura/roadmap/KPIs](architecture-roadmap.md) | Consolidaciones mínimas, prioridades y criterios propuestos, sin presentar mejoras como ya hechas |
| [REPLAY.md](REPLAY.md) | Cómo reconstruir snapshot y ejecutar pruebas sin usar el repositorio ni datos del usuario |
| [evidence-manifest.json](evidence-manifest.json) | Hashes y tamaños del material de reproducción documental |

Las familias inventariadas incluyen todos los packages/plugins/apps/extensión, CLI, scripts/pipelines, configs, binarios, tests/fixtures, agentes/adaptadores/skills, documentación/roadmap y legacy. **Falta inspección semántica exhaustiva** de muchos elementos; la tabla no oculta esa deuda con un veredicto de corrección.

## Entregables y cierre pendiente

Están guardados el inventario, la matriz y los hallazgos de esta tanda; hay análisis dirigido en arquitectura, concurrencia, Batuta, tokens, migraciones, UI/seguridad, tests/CI y roadmap. Están separados los confirmados, probables, descartes y limitaciones. Los KPIs son recomendaciones verificables. La valoración global se mantiene **N/E** por cobertura insuficiente; las 61 fichas no están completas y no se declara cierre.

El MCP conectado anunció proyecto sin configuración y perfil main; la configuración de este repositorio declara shared-checkout-pr/develop. Por ello la coordinación y publicación documental usan la CLI local. Se añade sólo el bloque propio al libro conjunto; no se alteran votos/textos de otros modelos ni reviewers-completed.

## Continuación exacta

Leer [CHECKPOINT.md](CHECKPOINT.md) y continuar por **plugins/agent-orchestrator/src/index.ts**, dispatch/port-resolution y budgets hasta completar su ficha y límites de contexto efectivos. Después recorrer los 44 plugins pendientes de plugins.json, completar las partes parciales y todas las familias aún sin lectura. Reconciliar las 21 propuestas activas contra aceptación y terminar el contraste histórico. Las pruebas con proveedor real y gasto siguen requiriendo consentimiento explícito; no es necesario para continuar el análisis estático/fixtures.
