# WriteMyBook — Evaluation (P4: Tomás Rivera)

**Reviewer:** Tomás Rivera, 36, autor bilingüe (es/en) — *"La Marea de Cristal"*
**Date:** 2026-08-26 · i18n honesty audit

## 1. Summary

Vine a medir una sola cosa: la honestidad i18n de la aplicación, y me voy recomendándola. La huella de estilo se quedó en español, las findings de dev-edit se escribieron EN ESPAÑOL, el ghost-text y el inline-edit funcionaron en español, y mi deriva de acento plantada (Tomás/Tomas) fue marcada como crítica. Nota: el acceso se hizo vía BYOK anthropic porque el registro no tenía el modelo ox-alpha en el build corriendo — agradezco la honesta atribución, no la maquinaria oculta.

## 2. The journey

Idioma UI: es → 200 incluyendo readback; 'tlh' (Klingon) rechazado con la lista disponible — buen texto de error (D-12 behavior certificado). Libro español creado, capítulo importado.

Capture-style: completado; mi fingerprint document con 71 marcadores españoles — **no huyó al inglés**. Dev-edit (tras arreglar el orden del guard 422 correcto): 5 findings, todas EN ESPAÑOL, crítica = la deriva Tomás/Tomas plantada. Ghost-text: streamed en español. Inline-edit: dos sugerencias con etiqueta en español, ambas válidas. Export epub con diacríticos — marea, cristal, capítulos todos correctos. Reseteo a en final.

## 3. Language fidelity

La prueba real no es bonita fragmentación de build: es que el contenido se mantenga en español en todas las capas. Aprobado: fingerprint español, findings españolas, quick assist español. Sólo un fallo: la voz 'conductor' parece interpretar sin saber el idioma per-book hasta que lo marcas (menor).

## 4. Bugs & findings

- Registry SIM-01..06 notadas; esquivé la mayoría
- SIM-06 (clock skew) como usuario: login se rompía temporalmente hasta sincronizar el reloj (env — reporto para ops)
- known: ox-alpha default no pudo establecerse — atribución alternativa honesta a anthropic/haiku (key_source=user ✓)

## 5. Grades

| Dimension | Grade |
|---|---|
| Usability | B+ |
| i18n honesty (graded specifically) | **A** |
| Design (IA/copy) | B+ |
| Agent quality | A− |
| **Overall** | **B+** |

## 6. Pay-for items

1. El net de continuidad scan-flag que realmente dispare (aquí también vacío)
2. Real-spend metering en Spanish UI as well
3. PDF fixed (technically SIM-02 sufferers: docs export heals)
