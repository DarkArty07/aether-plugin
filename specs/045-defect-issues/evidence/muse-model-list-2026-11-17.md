# Consulta `model/list` de Muse, 2026-11-17

Requisito R13 de la spec 045. Se hizo una sola consulta a `muse serve` de Muse Code 1.4.23 (1.4.23-R8977.1), con `--no-session-log --disable-shell --disable-write`, sin prompt y sin sesión: `initialize`, `initialized` y `model/list`, en JSON-RPC por líneas.

Resultado: caso (1) de R13. La respuesta llegó en 667 ms, con 2 mensajes en total, sin `run.usage`, sin eventos de turno y sin errores de cuota. El esquema de esta versión (`muse schema generate-json-schema`) describe `model/list` como «a query, not a command».

```json
{
 "why": "listed",
 "ms": 667,
 "frames": 2,
 "methods": {},
 "initError": null,
 "usageSeen": false,
 "turnSeen": false,
 "quotaError": false,
 "listError": null,
 "source": "providerCatalog",
 "providerId": "meta",
 "models": [
  {
   "id": "muse-wonder-1.0",
   "label": "muse-wonder-1.0",
   "variants": [
    "minimal",
    "low",
    "medium",
    "high",
    "xhigh",
    "max"
   ],
   "def": "max",
   "ctx": 1007997,
   "release": "2026-10-12"
  },
  {
   "id": "muse-wonder-full-1.0",
   "label": "muse-wonder-full-1.0",
   "variants": [
    "minimal",
    "low",
    "medium",
    "high",
    "xhigh",
    "max"
   ],
   "def": "max",
   "ctx": 1007997,
   "release": "2026-10-12"
  },
  {
   "id": "muse-ember-1.0",
   "label": "muse-ember-1.0",
   "variants": [
    "minimal",
    "low",
    "medium",
    "high",
    "xhigh",
    "max"
   ],
   "def": "max",
   "ctx": 1007997,
   "release": "2026-10-01"
  },
  {
   "id": "muse-spark-1.3",
   "label": "muse-spark-1.3",
   "variants": [
    "minimal",
    "low",
    "medium",
    "high",
    "xhigh",
    "max"
   ],
   "def": "max",
   "ctx": 1007997,
   "release": "2026-09-02"
  },
  {
   "id": "muse-spark-1.2",
   "label": "muse-spark-1.2",
   "variants": [
    "minimal",
    "low",
    "medium",
    "high",
    "xhigh"
   ],
   "def": "xhigh",
   "ctx": 1007997,
   "release": "2026-08-05"
  }
 ],
 "stderr": ""
}
```
