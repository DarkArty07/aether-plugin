# Tarjeta de intención: que el Lead reciba sus reglas completas y mantenimiento de todos los prompts

- **Dueño:** Christopher
- **Fecha:** 2026-11-02
- **Confirmada por el dueño** con «Lo haga trabja autonomamente» (corrida `auto-20261102-132613-14dd`). Issues: #139 (entrega) y #140 (mantenimiento).

## 1. Las palabras del dueño

1. Sobre lo que vio en la prueba de usuario nuevo: el Lead dijo que «el hook lo entregó truncado».
2. «Me gustaria qu eabireras el issue, que buscaramos la manera de hacer que el hook entregue el contenido compelto PERO tambien quiero ahcer mantenimiento a todos los system prompts que tenemos en aether plugin. Para optimizar y eliminar incoherencias, por ejemplo ese ese 10 porciento casi de desperdicio que notaste es posible optimizacion.»
3. «Para esta tareas necesito que opus lo haga. Solo opus puede escribir system prompts porque es una tarea delicada. Que opus max. Lo haga trabja autonomamente»
4. Antes, al aprobar el diagnóstico: «lanza un agente opus lo apruebo».

## 2. Lo que el dueño confirmó

Dos cosas, en una sola corrida:

1. **Entrega completa.** Las reglas del Lead (29,901 bytes) llegan hoy como un adelanto de 2,000 caracteres y un archivo que el Lead lee, porque Claude Code corta lo que un hook inyecta por encima de 10,000 caracteres. Buscar la forma de que lleguen completas en el primer mensaje, sin paso de lectura. La primera idea a medir es el cuerpo del agente `aether:lead`, que reemplaza todo el system prompt (F2).
2. **Mantenimiento de todos los prompts del plugin**: agentes, skills, preset, y las cadenas de prompt de los workflows y de `lib/`. Quitar incoherencias y redundancia, sin cambiar lo que el sistema hace. El diagnóstico de `using-aether` encontró 8.8 % de desperdicio y cuatro incoherencias.

**Quién escribe:** solo Opus escribe texto de prompt, a esfuerzo `max`. El Lead no lo escribe: lo dirige, corre las pruebas y revisa.

## 3. Criterios

- C1. Los issues #139 y #140 existen.
- C2. La forma de entrega se mide en un plugin desechable y el resultado queda en #139; se construye solo si pasa sus cinco mediciones y los tests.
- C3. Todos los prompts están auditados (tamaño, incoherencias con número de línea, redundancia).
- C4. Los prompts los reescribe solo Opus max; los tests pasan, cada pin cambiado se explica y el comportamiento no cambia.
- C5. El Juez (Opus, solo lectura) revisa, y no queda hallazgo crítico ni importante abierto.
- C6. Quedan registrados los tamaños antes y después. El merge a `main` y el release quedan en «Espera tu sí».

## 4. Fuera de alcance

- Cambiar lo que el sistema decide (modelos, escalera, precios, cuotas): una incoherencia que pida una decisión va como propuesta, no al texto.
- Añadir funciones. Que `aether-delegate authorize` acepte `--effort` es una propuesta.
