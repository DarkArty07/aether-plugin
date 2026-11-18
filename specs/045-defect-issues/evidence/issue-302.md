# #302: El aviso de modelos nuevos no lee Muse: falta un cliente MSP para model/list de muse serve

## Qué falta

El aviso de modelos nuevos de la spec 043 (#267) lee agy, grok y Codex, pero no Muse: listar los modelos de Muse pide `model/list` de `muse serve` por MSP, y el código no tiene cliente MSP (`plugins/aether/lib/harness/muse.js` solo corre `muse exec`). `aether-doctor` lo informa como «sin medio de captura».

## Evidencia

- `plugins/aether/config/models/harness-models.json`, entrada de Muse: `listedBy: muse serve (model/list)`, capturada a mano con muse 1.4.14 el 2026-10-27, «asked over MSP with the owner's login and no model call».
- La spec 043 se enmendó (R1, C1 y escenario 5) para dejar Muse fuera; decisión A129.

## Qué se pediría

Un cliente MSP mínimo que abra `muse serve`, pida `model/list` sin llamada al modelo, y que el lector diario (`lib/model-listing.js`, `captureVia.muse`) lo use con el mismo tope de tiempo que los demás. Sin llamadas pagadas: la lista no gasta cuota, según la captura de 2026-10-27 (muse 1.4.14); se comprueba de nuevo con la versión instalada antes de construir.

Relacionado: #267.


## Comentarios



