# Arquitectura, roadmap, simplificación y criterios de mejora

Snapshot `514758e783620c8953079be4d71fceccacb3de8b`; análisis dirigido, no dictamen exhaustivo de arquitectura.

## Autoridades y consolidación mínima

| Preocupación | Implementaciones localizadas | Autoridad y recomendación | Evidencia |
|---|---|---|---|
| Fetch de operaciones frente a spec OpenAPI | web-fetch engine y api/spec/openapi.ts fetchAndParseSpec | Usar engine seguro existente también para spec; conservar parser separado de transporte | NET-01, NET-02 |
| Exclusión de procesos | shared/with-file-mutex.ts y startup-reconciler/startup-mutex.ts | Reutilizar garantías de liveness/heartbeat/token del mutex común en startup/work-ref; no crear tercer mutex | ORCH-03 y pruebas de contador/SIGKILL |
| Ownership de trabajo | file-locks.json y agents.lock.json | Verificar propietario y coherencia bajo sección crítica existente; corrupción no se vuelve vacío | C1, C5; contraste D1/D2 |
| Autorización de cuenta | CLI accountEnvironment; API invoker sin el mismo dato | Regla común antes de seleccionar transporte, credencial única por cuenta; no mezclar permiso global con permiso de cuenta | C2 con schema válido |
| Presupuesto del pool | personal identity por remoto; ledger por workspace | Identidad del pool y reservas con mismo ámbito compartido; no un ledger nuevo por consumidor | C3, G61-CONFIG-01 |
| Mediciones de coste | core metrics breakdown; usage texto-only; tokenTax heurístico; UI 18% fijo | Persistir desglose y procedencia, representar unavailable sin inventar ahorros | TOK-01/02; comparación local |
| Selección de proveedor | selector rankProviders; runner scoreProvider; optimizer reuse rank + score multidimensional | Compartir selección donde represente la misma decisión; no eliminar puntuación de candidatos distinta sólo porque también se llame score | Lectura de las tres cadenas |
| Findings de validadores | IFinding TypeScript y múltiples zod locales | Un esquema runtime común junto al contrato existente si evita divergencia; cambio pequeño y con compatibilidad | Lectura deps/env/i18n/link-check |
| Distribución build | árbol build canónico + mirror dist + staging npm | Documentar las tres fases con una única explicación del builder | ORCH-06; build database focal |

## Estado de propuestas y plan Batuta

`proposals.json` incluye 1249 documentos Markdown bajo el árbol de propuestas: 1243 propuestas con status y 6 índices sin frontmatter. Estados al snapshot: done 1175, retired 47, in-progress 2, ready 4, review 15; blocked/paused 0 en esos documentos. Se mantiene registro individual de path/id/status/title. Sólo frontmatter no demuestra aceptación.

`active-proposals.md` extrae individualmente las propuestas activas y sus aceptación/slices para continuar. No se cambiaron estados. Los dos trabajos in-progress son la auditoría conjunta y Batuta. Las 21 propuestas no terminales necesitan contraste código/aceptación completo; que no haya blocked no significa que no existan dependencias de producto.

Batuta conserva una separación explícita entre partes implementadas con simulaciones y prueba real. f00551 tiene varios slices en review y los de validación real siguen pendientes. q00034 pide capa personal, discovery usable, observaciones de cuota, router/store común, contexto acotado por referencia y runs consentidos. La capa personal ya está en el código del snapshot; el plan S1 aún pending no prueba por sí solo ausencia de implementación. Discovery usable acaba de tener propuesta creada, por tanto no se atribuye su aceptación al código integrado sin trazarla.

**¿Puede completar hoy una tarea real end-to-end?** Esta auditoría no lo ha demostrado. La guía del snapshot dice que no se han ejecutado proveedores reales por cuenta, que no se escriben observaciones de cuota y que principal/worker/worktree/resume no están construidos. La prueba local del manager con fetch falso demuestra routing/transporte y defectos, no tarea real aceptada. Un permiso para auditar no autoriza gasto: no se inspeccionaron credenciales ni se invocó cuenta real. Es una limitación de evidencia y de producto declarada, no una conclusión inventada de imposibilidad universal de cada CLI.

## Priorización y KPIs

1. **P1 conservación de trabajo:** rollback preserva .git y archivos excluidos; claim nunca sustituye destino ocupado; un lock vivo no se roba y release antiguo no borra nuevo. Criterios: fixtures CLI con commits reales preservan SHAs/HEAD; tres procesos nunca coexisten en sección crítica; destino ocupado se rechaza sin cambio.
2. **P1 exclusividad y autorización:** un único dueño por slice y mismo propietario en ambos registros; todas las rutas API/CLI/MCP aplican cuenta y credencial autorizadas; spec no conecta fuera de allowlist. Criterios: exactamente una concesión en prueba de dos procesos; cero llamadas al mock en cuenta prohibida; cero hits en endpoint denegado.
3. **P2 evidencia fiable:** fallo de análisis no se comunica como cero defectos, catálogos corruptos no desaparecen, .env no devuelve valores, schemas capturan errores reales. Criterios: matriz éxito/error/timeout/corrupción con resultados distinguibles, centinelas ausentes en ambos canales, client SDK conserva código/hint válido.
4. **P2 medidas económicas:** todo ahorro tiene baseline y procedencia measured/estimated; invocation conserva componentes de bytes. Criterios: sin baseline, ahorro unavailable; igualdad de tarea/calidad al comparar modos; sumar búsquedas, detalles, relists, reintentos, delegación y respuesta final medible por host.
5. **P2 CI/release:** cambios a scripts que ejecuta un job obligan a seleccionarlo y npm recibe provenance solicitado. Criterios: jobMustRun true para cada input transitivo; argv de npm incluye flag; comprobación remota de attestation sólo cuando se publique legítimamente.
6. **P3 instrucciones:** bootstrap describe mirrors/build real. Criterio: documentación coincide con ruta producida y prueba smoke efectiva.

No se crean propuestas funcionales ni nuevas capas en esta auditoría; la revisión conjunta asignará después las correcciones. Cada KPI es prueba de aceptación recomendada, no resultado ya conseguido.

## Valoraciones

Notas provisionales acotadas en fichas: docs/cache 7.5, link-check 7, i18n 6, deps/env 5.5, locks proposals 5, runner 4.5; otras seis fichas en UI. Son opiniones basadas en rutas leídas, no mediciones. **No se calcula nota global**: agregarlas como si representaran todos los subsistemas falsearía la cobertura pendiente.
