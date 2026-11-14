# Tarjeta de intención 037: fuera la API de Artificial Analysis, las páginas como única fuente, y Gemini 4 Hydrogen

Issues: #267 (Hydrogen no se detecta) y #268 (sacar la API). Etapa 1 de tres; las etapas 2 y 3 (harnesses como extras) son las specs 038 y 039 y quedan fuera de esta tarjeta.

## Palabras del dueño (2026-11-13)

1. «ya salió gemini 4 hydrogen, nuestro sistema aether no lo detecta verdad?»
2. «hydrogen esta pensnaod para reemplazar a 3.8 flash pero eso como lo sabrias? puedes mirar AA para que veas»
3. «como sabemos hydrogen que escalon usa? es el probelma de siempre, no s esi ya lo hemos resuelto comoe stamos decieindo que modelo usa que escalon?»
4. «okay leeremos la pagina directamente entocnes»
5. «ya no quiero usar la API de AA no sirve, hay que sacarla del repo y del codigo y de todo, la solcuon es leer directamentente las paginas de AA y mantener la info»
6. «Supon que el unico plan que voy a pagar es el necesario de claude no mas. Los demas harness son extras»

## Entendimiento que el dueño confirmó

Aprobó en la página de plan del 2026-11-13 la propuesta entera, que para esta etapa dice:

- La API de Artificial Analysis sale del repo: scripts, skill, pruebas, datos de prueba y documentación vigente. Las cifras se leen solo de las páginas de los modelos.
- Hay un solo lector de páginas. Cada lectura deja en el repo una foto, por par, de lo que dio la página con su fecha, y las tablas se rearman de esa foto sin red.
- Qué páginas leer lo dicen los harnesses (lo que lista cada CLI), no una lista global de Artificial Analysis.
- La lectura es a pedido, con caché y pausa entre páginas; nunca programada.
- Si a una página le falta un campo, el lector lo dice y conserva la cifra anterior con su fecha; nunca escribe un vacío.
- Hydrogen entra en agy. Con inteligencia y código, Hydrogen medium sirve los escalones 1 y 2, Hydrogen high el 3, y ninguno el 4 ni el 5. Su papel es implementar.
- Flash queda reemplazado.
- La regla de elección cambia: un par externo que va a implementar tiene que alcanzar el escalón también en código, no solo en inteligencia.

## Criterios (qué y por qué)

1. En el repo no queda ninguna llamada a una API de Artificial Analysis ni lectura de su clave (palabras 5). Los documentos de historia (specs anteriores, changelog, decisiones ya numeradas, traspasos) conservan su texto.
2. Un solo lector de páginas sirve a todos los scripts (palabras 5: «leer directamente las páginas»).
3. La foto de las cifras vive en el repo con la fecha de cada lectura, y las tablas se rearman de ella sin red (palabras 5: «mantener la info»).
4. El índice de modelos sale de lo que lista cada harness y de la foto (palabras 5 y 6: sin lista global, cada harness trae lo suyo).
5. Hydrogen está en la tabla de agy y la elección lo coloca según sus cifras: medium en los escalones 1 y 2, high en el 3 (palabras 1 y 3).
6. Flash deja de elegirse y consta como reemplazado, con motivo y fecha (palabras 2).
7. Para implementar, un par externo alcanza un escalón solo si llega en inteligencia y en código (palabras 3: «el problema de siempre»).
8. Un fallo de lectura nunca borra una cifra ni pasa en silencio (palabras 5: «mantener la info»).

## Qué queda fuera

- Las etapas 2 y 3: carpetas por harness, extras como plugins, aviso de modelos nuevos, ficha en el doctor y el panel.
- El release: versión, changelog, tag y publicación esperan el sí del dueño.
- La clave de Artificial Analysis del `.env` local del dueño: se borró el 2026-11-13 con su sí y no es parte de la construcción.
- Cambiar la escalera guardada. Si las cifras de hoy la moverían, el refresco lo informa y lo decide el dueño.
- Dar a Hydrogen otros papeles (supervisar, revisar, asientos de diseño).

## Respuestas a las preguntas de aclaración

- ¿Comprobación real de Grok, Cursor y Muse antes de congelarlos? «congela como estan». No afecta a esta etapa.
- ¿Aviso de modelos nuevos? «sobre modelos nuevos es buena idea». Va en la etapa 2.
- ¿De dónde salen las cifras? De las páginas, nunca de una API (palabras 4 y 5).
- ¿Vale que en esta etapa las páginas por defecto salgan de las filas de la tabla de pares y que un modelo nuevo entre dando su dirección a mano (Supuesto 6 del diseño)? «Lo que recomeindes que sea util y mantenible». El Lead recomendó aceptarlo: el descubrimiento automático va con el aviso de modelos nuevos de la etapa 2.
- ¿Se borra la clave de la API del `.env` local? «Ya no usamos api asi que si».
