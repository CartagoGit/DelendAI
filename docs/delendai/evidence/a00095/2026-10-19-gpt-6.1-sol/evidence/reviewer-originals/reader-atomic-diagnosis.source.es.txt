# G51: precisión causal del fallo de lectura

Auditor gpt-6.1-sol; código `514758e783620c8953079be4d71fceccacb3de8b`; ejecución local Linux, Bun 1.4.2. Complementa las reproducciones anteriores, sin modificar su evidencia ni los dictámenes ajenos.

## Observación propia

Un escritor realiza 1.000 reemplazos con el `writeFileAtomic` real. Cuatro loops concurrentes usan SafeWorkspaceReader, readFile directo, stat directo y realpath directo, sobre el mismo archivo preexistente. Se registran errores completos, incluida ruta, y valores inesperados devueltos por realpath.

| Lectura | Llamadas | Errores |
|---|---:|---:|
| SafeWorkspaceReader.readText | 41.114 | 24 ENOENT |
| readFile(path) directo | 91.757 | 0 |
| stat(path) directo | 95.589 | 0 |
| realpath(path) directo | 89.171 | 0 excepciones; 78 resultados inesperados |

Los 78 resultados inesperados acaban en **`state.json (deleted)`**. Los ejemplos de error del lector seguro intentan stat/open sobre ese mismo sufijo literal, no sobre el path original. La ejecución diagnóstica anterior también produjo 24 errores del lector seguro y cero errores directos; se conserva aparte, no se suma como un único ensayo.

`SafeWorkspaceReader.#resolveContainedOnDisk` usa realResolvePath y devuelve la ruta obtenida; readText la pasa a readFile/stat. realResolvePath acepta un resultado string de realpath sin comprobar que señale la entrada original todavía existente. Los resultados observados conectan esa cadena con el ENOENT. Atribuir el detalle interno exacto a una syscall de Bun requeriría traza del runtime; no se ha realizado y no se inventa.

## Qué cambia mi opinión

La observación anterior de ENOENT bajo escrituras atómicas era real. **No prueba un intervalo en que rename POSIX haya dejado ausente el destino**: en este ensayo las operaciones directas sobre el destino no fallan y los errores señalan otra ruta. Tampoco confirma que la misma cadena se produzca dentro de la sección crítica de un claim: el escritor externo de esta sonda no usa el mutex de la tabla de claims.

Por tanto confirmo la fragilidad de lectura y del catch-all de loadLock, y mantengo sin confirmar la causa/frecuencia de doble concesión pública propuesta en G51. La reproducción más reciente de claims mantuvo ambos procesos vivos hasta inspeccionar respuestas y estado: 100 rondas, cero doble concesión y un ganador por ronda. El control efímero explica otra vía de desaparición: purga de propietario muerto. C1 sigue siendo un fallo diferente de identidad/idempotencia.

Para el consenso propondría una regresión del lector bajo reemplazos reales, diagnóstico de confianza del store y controles de lifecycle. No justificaría añadir otro mutex o un sleep de 1 ms como arreglo demostrado por este ensayo. La corrección debe probarse contra el caso exacto y su coste; no se implementa aquí.

## Repetición

Script `evidence/completion-root/repro-reader-atomic.ts.txt` y logs `repro-reader-atomic.log` / `repro-reader-atomic-initial.log`. Desde la copia congelada: `bun /tmp/delendai-audit-completion-root/repro-reader-atomic.ts`, exit 0. Todo el estado se crea y borra en un directorio temporal propio. No se ha probado Node, otro Bun, otro filesystem, Windows ni el caso público de claims bajo estas mismas rutas anómalas.
