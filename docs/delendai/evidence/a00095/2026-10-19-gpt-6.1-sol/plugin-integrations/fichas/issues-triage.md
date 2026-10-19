# issues-triage — ficha de cobertura completa de fuente

SHA `514758e783620c8953079be4d71fceccacb3de8b`; Codex/GPT-6, 2026-10-19. 14 archivos producción y seis specs leídos completos; README/package también. SDK real in-memory sobre gh fake, sin cuentas, credenciales ni comentarios reales. Tests globales a cargo del root.

**Funcionalidad.** Bot interno privado, sin presets ni publicación npm. Tres herramientas reales list/run/comment. Depende de proposals para allocator y de gh autenticado para forge. Clasifica keywords mecánicamente, no LLM; parámetros controlan publicación local, comentario y labels, aunque comentario se hace por defecto. Sin repo registra cero tools y knowledge con configuración.

**Contratos MCP.** Schemas estrictos y output list/run sólo éxito no corresponden a errores JSON, INT-TRI-01 confirmado en cliente MCP real. run/comment descripciones exigen confirm:true que schemas rechazan por key extra, INT-TRI-02; handlers sí publican con bandera ausente. Specs pasan por handler fake saltando SDK. comment failure sí conforma output, list/run no.

**Seguridad/aislamiento.** gh usa argv sin shell, sólo repo configurado; no secretos almacenados por gh wrapper. Bot notice prepend garantiza atribución automática. Proposals paths getter se remapea al caller checkout y allocator counter es compartido, buena separación. Body de issue y título se guardan verbatim en propuesta sin redactSecrets de este módulo, y bloque fenced puede ser cerrado por body que contiene ```; contenido no confiable nunca debe ascender a instrucciones al rehidratar. No se redactó ni publicó un secreto real, ni se afirma explotación host de prompt injection sin cadena lectora auditada.

**Calidad.** Análisis/cálculo/IO separados, JSON tolerante del gh wrapper conserva errores nozero como reason. `_draft` se calcula y descarta cuando no hay write; mensaje promete draft inexistente en salida. hasBotReply detectado pero no usado para idempotencia; retries pueden duplicar comentarios y propuestas. write usa atomic; allocator evita ids duplicados. Tests cubren éxito/error/filtros/disclosure, paths worktree y materialización, sin frontera SDK/confirmación/idempotencia.

**Tokens/coste.** Defs SDK reales 2773 B, input676/output1249, ~694 tokens estimados; sin tokens ni costes proveedor del bot. Triage run retorna resumen compacto, no issue.body ni draft completo, economía a costa de que draft no está disponible. GitHub list default implícito gh no pagination propia; issue body/ comments se obtienen completos al analizar. Salidas toolJsonBounded capadas pero error envelopes defectuosos causan reintentos.

**Producto.** Experimental/private coherente; dep gh ausente muestra stderr pero sin probe específico del plugin. Clarificar defaults de publicación y confirmación; devolver draft o reference cuando write=false; idempotencia por issue/version y conservar errores separados por operación. No necesita ampliar abstracciones: corregir esquema y usar canónico flujo propuesta ya disponible.

**Nota provisional: 5/10.** Alcance interno honesto, seams y disclosure sólidos, pero contratos de fallo y confirmación contradicen interfaz publicada; draft no entregable e idempotencia incompleta. Datos y regresiones en INT-TRI-01/02 y repro-triage.log.
