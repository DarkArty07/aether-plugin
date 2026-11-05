# Prototype: the topic question and the delivery (spec 026)

The owner approved this prototype with «me parece bien» on 2026-11-04, and then named the first phase: «analisis automatizado sera.» It is written for an invented project (an online-shop API); the findings are examples of the shape, not real ones. The skill answers in the person's language; this is the Spanish the owner saw, with the phase name he chose.

## Paso 1: lo que dice el Lead al invocar `/aether:audit`

> Revisé **tienda-api** (Node 22, Express, 412 archivos, 1.830 commits). **Análisis automatizado**, ya hecho:
> - **Tests:** 214 pasan, 2 fallan (`test/orders.test.js`).
> - **Dependencias:** 3 vulnerabilidades conocidas, 1 alta.
> - **Secretos:** 1 posible clave en el historial (commit `4f2a91c`).
> - **Hotspots:** `src/payments/`, `src/orders/checkout.js`, `src/auth/session.js`.
> - **Abierto:** 14 issues (5 con más de 90 días), 6 ramas sin tocar en 2 meses.
>
> Propongo auditar **9 temas**, un agente por tema:
> 1. **Bugs**, empezando por los 3 hotspots.
> 2. **Seguridad**: hay login, pagos y una posible clave expuesta.
> 3. **Dependencias**: hay una vulnerabilidad alta.
> 4. **Tests**: 2 rojos y los pagos no tienen pruebas de fallo.
> 5. **Fiabilidad**: llama a 3 servicios externos (Stripe, envíos, Redis).
> 6. **Arquitectura y deuda**: `checkout.js` cambió 84 veces en 6 meses.
> 7. **Documentación contra código**: README, `docs/` y 40 comandos documentados.
> 8. **Higiene del repo**: ramas viejas e issues envejecidos.
> 9. **Oportunidades**: el README tiene un Roadmap y hay issues que piden funciones.
>
> **Dejo fuera:** 10 **Accesibilidad** (no tiene interfaz), 11 **Rendimiento** (no hay metas de tiempo ni pruebas de carga; lo agrego si quieres), 12 **Versiones** (no publica paquetes ni releases).
>
> Estimado: 20 a 30 minutos y US$ 2 a 4, según las auditorías anteriores.
>
> **¿Confirmas, quitas o agregas alguno?** Por ejemplo: «sí», «quita el 8», «agrega el 11».

## Paso final: el resultado

> **Auditoría de tienda-api · 4 nov 2026 · 9 temas · 47 hallazgos, 19 sobrevivieron la verificación**
>
> **Espera tu sí**
> - Elige cuáles tomas, por número. Cada uno se vuelve un issue en GitHub.
> - El n.º 2 incluye rotar una clave: eso es tuyo, el agente solo limpia el historial.
>
> **Supuestos**
> - Traté los 2 tests rojos como tests desactualizados, no como bug, porque el precio de envío nuevo está en el changelog de octubre.
>
> **P0 · Urge ya**
>
> 1. **[Bug · comprobado con test]** Un pago que tarda más de 30 s se cobra dos veces.
>    `src/payments/charge.js:88`: el reintento no manda clave de idempotencia. Un test en una copia desechable lo reproduce.
>    *Por qué P0:* cobra doble a clientes reales en cada caída del proveedor. · Pequeño · un agente
> 2. **[Seguridad · confirmado leyendo]** Una clave real de Stripe quedó en el historial.
>    `config/dev.env`, commit `4f2a91c`: se borró en el commit siguiente, pero sigue en git.
>    *Por qué P0:* cualquiera con acceso al repo la puede leer. · Pequeño · tú y un agente
>
> **P1 · Pronto**
>
> 3. **[Tests · comprobado]** El CI está rojo desde hace 9 días.
>    `test/orders.test.js:140` y `:162` esperan el precio de envío anterior.
>    *Por qué P1:* con el CI rojo, un fallo nuevo pasa sin que nadie lo vea. · Pequeño · directo
> 4. **[Dependencias · comprobado]** `jsonwebtoken` 8.5.1 tiene una vulnerabilidad alta que reporta `npm audit`; la 9 la corrige, pero cambia la API. · Mediano · un agente
> 5. **[Bug · confirmado leyendo]** Si Redis se cae, el login responde 500 en vez de pedir la contraseña otra vez.
>    `src/auth/session.js:54` lanza el error sin capturarlo. · Mediano · un agente
> 6. **[Docs · comprobado]** El README dice `npm run migrate`, pero ese script ya no existe: desde marzo se llama `db:migrate`. · Pequeño · directo
>
> **P2 · Programable**
>
> 7. **[Deuda · confirmado leyendo]** `src/orders/checkout.js` es el hotspot n.º 1: 1.100 líneas, 84 cambios en 6 meses, y ahí estuvieron 9 de los 14 bugs cerrados este año. Conviene partirlo en tres módulos. · Grande · el swarm
> 8. **[Fiabilidad · confirmado leyendo]** Ninguna llamada al proveedor de envíos tiene timeout (`src/shipping/client.js:12`): si se cuelga, el pedido se queda colgado. · Pequeño · un agente
> 9. **[Higiene · comprobado]** 6 ramas sin tocar en más de 60 días; 2 tienen trabajo que no está en main (`feat/cupones`, `fix/stock-negativo`). Decidir si se rescatan o se borran; borrar es tuyo. · Pequeño · tú
>
> **P3 · Cuando puedas / ideas**
>
> 10. **[Oportunidad · propuesta]** El Roadmap del README promete «exportar pedidos a CSV» y 3 issues lo piden (#41, #57, #63); no hay nada empezado. · Mediano · diseño y luego el swarm
> 11. **[Oportunidad · propuesta]** Los logs no llevan el id del pedido; con él, rastrear un pago fallido sería una búsqueda en vez de leer todo el log. · Pequeño · un agente
> 12. **[Deuda · confirmado leyendo]** 23 TODO sin issue, 15 de ellos en `src/legacy/`, que no cambia desde hace 2 años: prioridad baja, porque es deuda que no estorba si nadie toca ese código. · Pequeño · un agente
>
> **Sin verificar (no los ordené)**
> - **[Bug]** Posible carrera en el stock cuando dos personas compran el último artículo (`src/orders/stock.js:30`). El verificador no pudo reproducirla ni descartarla; hace falta una prueba de concurrencia.
>
> **Desde la última auditoría (12 oct):** 4 nuevos, 3 siguen, 6 resueltos.
> **Descartados:** 28 (el verificador refutó 22, 4 ya tenían issue, 2 estaban repetidos). La lista completa está en el reporte guardado.
> **No cubrí:** rendimiento ni accesibilidad, que dejaste fuera; leí a fondo 63 de 412 archivos (los hotspots y lo que tocan), el resto solo lo busqué por patrones.
> **RADAR:** Rápido 26 min · Delegación 31 de 40 llamadas en otros harness · Asequible US$ 2.84.
> Sesión `8a00…`: US$ 2.84 a precio de lista (Lead US$ 0.41, agentes US$ 2.43). El total incluye las llamadas a otros harness (31 llamadas, US$ 1.12).
>
> **¿Cuáles tomas?** Por ejemplo: «1, 2, 3 y 6».
