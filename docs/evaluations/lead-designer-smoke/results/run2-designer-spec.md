# reading-list: especificación de diseño

- **Fecha:** 2026-10-08
- **Estado:** el owner aprobó el diseño; esta especificación espera su revisión.
- **Enfoque elegido:** A, un número fijo por libro.

## 1. Origen

### Lo que dijo el owner

- Quiere una librería pequeña y una herramienta de línea de comandos para llevar su lista de lectura, para Node.js 22 y sin dependencias.
- Tres operaciones: añadir un libro, marcar un libro como leído y listar los libros que aún no ha leído.
- Los datos viven en `~/.reading-list.json`.
- Un libro tiene solo título y autor, nada más (sin fecha). El estado leído o pendiente sí hace falta.
- La salida es texto plano, un libro por línea.
- Las pruebas usan `node:test`.
- Eligió el enfoque A (número fijo por libro), comandos y mensajes en inglés, y `list` en el orden en que añadió los libros.
- Aprobó el diseño completo tal como se le presentó.

### Supuestos que el owner aceptó

- La librería es el núcleo, y la CLI es una capa fina que solo la llama.
- Hay un solo usuario y no hay sincronización.
- Por ahora no hay borrar, ni editar, ni listar los leídos.

### Decisiones del Designer que el owner aprobó con el diseño

- Hay tres códigos de salida: 0, 1 y 2.
- Marcar un libro ya leído no es un error.
- Un comando mal escrito solo muestra el uso.
- Al guardar, se limpian los espacios del título y del autor.
- Los mensajes son los de la sección 7, al pie de la letra.

## 2. Alcance

**Dentro:**

- Tres comandos: `reading-list add <title> <author>`, `reading-list read <number>` y `reading-list list`.
- La librería, con `addBook`, `markRead`, `listPending` y `formatBook`.
- La instalación local con `npm link`.

**Fuera, por ahora:**

- borrar, editar o desmarcar un libro;
- listar los leídos;
- cambiar la ruta de los datos desde la CLI (no hay variable de entorno ni opción para ello; la librería sí recibe la ruta, y así se prueba);
- sincronización y varios usuarios;
- protección frente a dos comandos lanzados a la vez.

## 3. Criterios de éxito

| Criterio | Cómo se comprueba |
|---|---|
| Desde cualquier directorio se puede añadir un libro, marcarlo como leído y ver los pendientes. | `test/bin.test.js` ejecuta el comando real desde una carpeta temporal. |
| Los datos sobreviven entre ejecuciones. | `test/bin.test.js` usa un proceso nuevo para cada comando; `test/index.test.js` usa llamadas separadas. |
| La librería se puede probar sin pasar por la terminal. | `test/books.test.js`, `test/store.test.js` y `test/index.test.js` llaman a las funciones directamente. |
| No tiene dependencias. | `test/package.test.js`. |
| Ninguna prueba toca el `~/.reading-list.json` real. | El aislamiento descrito en la sección 10. |

## 4. Arquitectura

```
package.json          declara el paquete y el comando; sin dependencias
README.md             instalación y uso, en inglés
bin/reading-list.js   el comando: calcula ~/.reading-list.json y llama a main
src/cli.js            main(args, io): argumentos → librería → texto y código de salida
src/index.js          la librería pública: lee el archivo, aplica la regla, guarda
src/books.js          las reglas, sobre la lista en memoria; no toca archivos
src/store.js          lee, valida y guarda el archivo JSON; no conoce las reglas
test/*.test.js        un archivo de pruebas por módulo, más uno para package.json
```

- Las importaciones van en una sola dirección: `bin → cli → index → books, store`. `books.js` y `store.js` no se importan entre sí.
- Usa módulos ES (`"type": "module"`) y necesita Node.js 22 o superior.
- Solo usa módulos que trae Node: `node:fs/promises`, `node:os` y `node:path`. Las pruebas usan además `node:test`, `node:assert/strict` y `node:child_process`.
- Ningún módulo de `src/` calcula la ruta del archivo. Solo `bin/reading-list.js` la conoce.

## 5. El archivo de datos

- **Ruta:** `path.join(os.homedir(), '.reading-list.json')`. Solo se calcula en `bin/reading-list.js`.
- **Contenido:** un array JSON de entradas, en el orden en que se añadieron.
- **Entrada:** un objeto con `title` (string), `author` (string) y `read` (boolean). Si una entrada trae otros campos, por ejemplo por una edición a mano, se guardan tal cual.
- **Formato al guardar:** exactamente `JSON.stringify(entries, null, 2) + '\n'`, en UTF-8.
- **Número de un libro:** su posición en el array, empezando en 1. No se guarda en el archivo. La librería solo añade al final, y nunca reordena ni quita entradas, así que el número de un libro no cambia.

Ejemplo con tres libros, de los que el 2 está leído:

```json
[
  {
    "title": "Rayuela",
    "author": "Julio Cortázar",
    "read": false
  },
  {
    "title": "Ficciones",
    "author": "Jorge Luis Borges",
    "read": true
  },
  {
    "title": "Cien años de soledad",
    "author": "Gabriel García Márquez",
    "read": false
  }
]
```

## 6. Interfaces

Las firmas usan notación de tipos solo para documentarlas. El código es JavaScript: módulos ES, sin TypeScript.

### 6.1 Tipos y errores

```ts
// Lo que se guarda en el archivo. Puede traer más campos si se editó a mano.
type Entry = { title: string, author: string, read: boolean }

// Lo que devuelven la librería y las reglas.
// number = posición en la lista completa, empezando en 1.
type Book = { number: number, title: string, author: string, read: boolean }
```

Los errores esperados son instancias de `Error`. Tienen una propiedad `code` y, según el código, algún dato más. Su `message` es exactamente el texto de esta tabla, y la CLI lo imprime detrás de `reading-list: `.

| `code` | Propiedades extra | `message` |
|---|---|---|
| `INVALID_BOOK` | ninguna | `title and author cannot be empty` |
| `DUPLICATE_BOOK` | `book: Book`, la entrada que ya existe | `already in the list: <formatBook(book)>` si `book.read` es `false`; `already read: <formatBook(book)>` si es `true` |
| `BOOK_NOT_FOUND` | `number`: el valor recibido | `no book number <number>` |
| `CORRUPT_FILE` | `file: string`, la ruta | `<file> is not a valid reading list (<reason>). Fix or move it; nothing was changed.` |

`<reason>` es uno de estos tres textos:
- `not valid JSON`;
- `not a JSON array`;
- `entry <n> is not a valid book`, donde `<n>` es la posición, empezando en 1, de la primera entrada inválida.

Los demás errores, como `EACCES` o `ENOSPC` del sistema de archivos, se propagan sin cambios.

### 6.2 `src/books.js`: las reglas

Son funciones puras: no tocan archivos y nunca modifican el array ni los objetos que reciben.

```ts
export function add(entries: Entry[], title: string, author: string): { entries: Entry[], book: Book }
export function markRead(entries: Entry[], number: number): { entries: Entry[], book: Book, alreadyRead: boolean }
export function pending(entries: Entry[]): Book[]
export function formatBook(book: Book): string
```

**Limpieza y comparación:**

- `clean(s) = s.trim().replace(/\s+/g, ' ')`. Quita los espacios del principio y del final, y cambia cada tramo de espacios en blanco, incluidos tabuladores y saltos de línea, por un solo espacio.
- Dos libros son el mismo si coinciden `key(title)` y `key(author)`, con `key(s) = clean(s).normalize('NFC').toLowerCase()`. Gracias a NFC, una letra con tilde cuenta igual tanto si llega compuesta como descompuesta.

**`add(entries, title, author)`:**

1. Si `title` o `author` no son strings, o si `clean()` los deja vacíos, lanza `INVALID_BOOK`.
2. Si alguna entrada es el mismo libro, lanza `DUPLICATE_BOOK` con la primera que coincida.
3. Si no, añade `{ title: clean(title), author: clean(author), read: false }` al final. Devuelve la lista nueva y, como `book`, esa entrada con `number` igual a la longitud que tenía `entries` más 1.

**`markRead(entries, number)`:**

1. Si `number` no es un entero entre 1 y `entries.length`, lanza `BOOK_NOT_FOUND`.
2. Si la entrada ya está leída, devuelve `entries` con el mismo contenido, su `book` y `alreadyRead: true`.
3. Si no, devuelve:
   - una copia de la lista en la que esa entrada pasa a ser `{ ...entry, read: true }`, que conserva sus campos extra;
   - su `book`, con `read: true`;
   - `alreadyRead: false`.

**`pending(entries)`:** devuelve los `Book` de las entradas con `read: false`, en el orden del array y cada uno con su número de posición.

**`formatBook(book)`:** devuelve `` `${book.number}. ${book.title} — ${book.author}` ``. El separador es una raya (U+2014) con un espacio a cada lado. Ejemplo: `3. Cien años de soledad — Gabriel García Márquez`.

### 6.3 `src/store.js`: el archivo

```ts
export async function loadEntries(file: string): Promise<Entry[]>
export async function saveEntries(file: string, entries: Entry[]): Promise<void>
```

**`loadEntries(file)`:**

1. Lee `file` en UTF-8. Si no existe (`ENOENT`), devuelve `[]` y no crea nada. Cualquier otro error de lectura se propaga sin cambios.
2. Si el texto no es JSON válido, lanza `CORRUPT_FILE` con el motivo `not valid JSON`. Un archivo vacío también entra en este caso.
3. Si el JSON no es un array, lanza `CORRUPT_FILE` con el motivo `not a JSON array`.
4. Una entrada es válida si es un objeto (no `null` ni un array) con `title` y `author` de tipo string y `read` de tipo boolean. Si alguna no lo es, lanza `CORRUPT_FILE` con el motivo `entry <n> is not a valid book`, por la primera que falle.
5. Si todo está bien, devuelve las entradas tal como se leyeron.

**`saveEntries(file, entries)`:**

1. Escribe `JSON.stringify(entries, null, 2) + '\n'` en el temporal `` `${file}.${process.pid}.tmp` ``, en la misma carpeta.
2. Renombra el temporal a `file`, que queda reemplazado.
3. Si falla la escritura o el renombrado, borra el temporal (sin fallar si ya no existe) y propaga el error original. El archivo anterior queda intacto.
4. No crea carpetas.

### 6.4 `src/index.js`: la librería pública

El campo `"exports"` del paquete apunta a este archivo.

```ts
export async function addBook(file: string, title: string, author: string): Promise<Book>
export async function markRead(file: string, number: number): Promise<{ book: Book, alreadyRead: boolean }>
export async function listPending(file: string): Promise<Book[]>
export { formatBook } from './books.js'
```

- **`addBook`:** llama a `loadEntries(file)`, después a `add(...)` y después a `saveEntries(file, ...)`, y devuelve `book`. Lee el archivo antes de validar el libro: con un archivo dañado, el error es `CORRUPT_FILE` aunque el título esté vacío. Si `add` falla, no guarda nada.
- **`markRead`:** lee el archivo y aplica `markRead` de `books.js`. Solo guarda si `alreadyRead` es `false`. Devuelve `{ book, alreadyRead }`.
- **`listPending`:** lee el archivo y devuelve `pending(...)`. Nunca escribe.
- Los errores de `books.js` y `store.js` se propagan sin cambios.
- Si el archivo no existe, `listPending` devuelve `[]` y `markRead` lanza `BOOK_NOT_FOUND`, y ninguno de los dos lo crea. `addBook` sí lo crea.

### 6.5 `src/cli.js`: la CLI

```ts
export async function main(
  args: string[],
  io: { file: string, stdout: { write(text: string): void }, stderr: { write(text: string): void } }
): Promise<0 | 1 | 2>
```

`args` son los argumentos sin `node` ni el script, es decir, `process.argv.slice(2)`. En lo que sigue, `<line>` es `formatBook(book)`.

**Formas válidas:** solo estas tres.

- `['add', title, author]`: llama a `addBook(io.file, title, author)`, escribe `Added: <line>\n` en stdout y devuelve 0.
- `['read', n]`, donde `n` cumple `/^[0-9]+$/`: llama a `markRead(io.file, Number(n))`, escribe en stdout `Read: <line>\n` (o `Already read: <line>\n` si `alreadyRead` es `true`) y devuelve 0.
- `['list']`: llama a `listPending(io.file)`, escribe una línea `<line>\n` por libro en stdout (nada si no hay ninguno) y devuelve 0.

**Cualquier otra forma** (sin argumentos, comando desconocido, otro número de argumentos, o una `n` que no sea solo cifras):
- escribe el texto de uso de la sección 7 en stderr;
- devuelve 2;
- no llama a la librería ni toca el archivo.

**Errores:**
- Si la librería lanza cualquier error, `main` escribe `reading-list: <error.message>\n` en stderr y devuelve 1.
- Los errores de la librería o del archivo no hacen que `main` rechace: siempre resuelve con un código.

`main` no tiene una ruta por defecto: usa `io.file` tal cual.

### 6.6 `bin/reading-list.js`

- La primera línea es `#!/usr/bin/env node`.
- Llama a `main(process.argv.slice(2), { file: path.join(os.homedir(), '.reading-list.json'), stdout: process.stdout, stderr: process.stderr })`.
- Asigna el resultado a `process.exitCode`. No usa `process.exit`, para no cortar la salida a medias.
- En git tiene permiso de ejecución (modo `100755`).

### 6.7 `package.json`

```json
{
  "name": "reading-list",
  "version": "1.0.0",
  "description": "A reading-list library and CLI",
  "type": "module",
  "exports": "./src/index.js",
  "bin": {
    "reading-list": "bin/reading-list.js"
  },
  "engines": {
    "node": ">=22"
  },
  "scripts": {
    "test": "node --test"
  }
}
```

No tiene `dependencies`, `devDependencies`, `peerDependencies` ni `optionalDependencies`.

### 6.8 `README.md`

Va en inglés, como los mensajes, y sustituye a la línea actual. Cubre estos puntos:
- qué es, en una línea;
- la instalación: `npm link` en el repositorio;
- los tres comandos, con el ejemplo de sesión de la sección 7;
- dónde viven los datos (`~/.reading-list.json`) y qué pasa si el archivo está dañado;
- el uso como librería: `addBook`, `markRead`, `listPending` y `formatBook`, que reciben la ruta del archivo como primer argumento (salvo `formatBook`, que recibe un libro);
- las pruebas: `npm test`.

## 7. Textos exactos de la CLI

Todas las líneas terminan en `\n`. `<line>` es `<number>. <title> — <author>`.

| Situación | Salida | Código |
|---|---|---|
| `add` correcto | stdout: `Added: <line>` | 0 |
| `read` de un libro sin leer | stdout: `Read: <line>` | 0 |
| `read` de un libro ya leído | stdout: `Already read: <line>` | 0 |
| `list` | stdout: una `<line>` por libro pendiente; nada si no hay | 0 |
| Título o autor vacíos | stderr: `reading-list: title and author cannot be empty` | 1 |
| Duplicado de un libro sin leer | stderr: `reading-list: already in the list: <line>` | 1 |
| Duplicado de un libro leído | stderr: `reading-list: already read: <line>` | 1 |
| Número inexistente | stderr: `reading-list: no book number <number>` | 1 |
| Archivo dañado | stderr: `reading-list: <file> is not a valid reading list (<reason>). Fix or move it; nothing was changed.` | 1 |
| Otro error del sistema | stderr: `reading-list: <error.message>` | 1 |
| Comando mal escrito | stderr: el texto de uso | 2 |

Este es el texto de uso, exacto. Son cuatro líneas, cada una terminada en `\n`, y las descripciones empiezan en la columna 39, es decir, después de 38 caracteres:

```
Usage:
  reading-list add <title> <author>   add a book to read
  reading-list read <number>          mark a book as read
  reading-list list                   show the books not read yet
```

Ejemplo de sesión, partiendo del archivo de la sección 5:

```
$ reading-list list
1. Rayuela — Julio Cortázar
3. Cien años de soledad — Gabriel García Márquez
$ reading-list read 3
Read: 3. Cien años de soledad — Gabriel García Márquez
$ reading-list read 3
Already read: 3. Cien años de soledad — Gabriel García Márquez
$ reading-list add "El nombre del viento" "Patrick Rothfuss"
Added: 4. El nombre del viento — Patrick Rothfuss
$ reading-list add "rayuela" "JULIO  CORTÁZAR"
reading-list: already in the list: 1. Rayuela — Julio Cortázar
$ reading-list read 9
reading-list: no book number 9
```

## 8. Flujo de datos

1. `bin/reading-list.js` calcula la ruta y llama a `main`.
2. `main` comprueba que los argumentos tienen una forma válida. Si no la tienen, muestra el uso y devuelve 2 sin leer el archivo.
3. La función de `src/index.js` lee el archivo una vez (`loadEntries`) y aplica la regla de `src/books.js` en memoria. Solo si algo cambió, guarda una vez (`saveEntries`).
4. `main` imprime el resultado o el error, y devuelve el código.

Cada comando lee el archivo como mucho una vez y lo escribe como mucho una vez. Ningún error deja el archivo cambiado:
- los errores de reglas y de validación ocurren antes de guardar;
- si falla el guardado, el archivo anterior queda intacto.

## 9. Manejo de errores

| Capa | Qué comprueba | Resultado |
|---|---|---|
| `src/cli.js` | La forma de los argumentos. | El uso en stderr, código 2. |
| `src/books.js` | Título o autor vacíos, duplicados y números inexistentes. | Un `Error` con `code`; la CLI imprime su mensaje y devuelve 1. |
| `src/store.js` | Que el archivo exista y sea válido. | Si falta, es una lista vacía. Si está dañado, `CORRUPT_FILE` (código 1) y el archivo no se toca. |
| Sistema | Permisos, disco lleno y otros fallos de lectura o escritura. | El error se propaga; la CLI imprime su mensaje y devuelve 1. |

Marcar un libro ya leído no es un error: la CLI lo dice en stdout y devuelve 0.

## 10. Pruebas

Todas usan `node:test` y `node:assert/strict`. `npm test` ejecuta `node --test`, que encuentra `test/*.test.js`.

**Aislamiento:**

- Cada prueba que usa archivos crea su propia carpeta con `fs.mkdtemp(path.join(os.tmpdir(), 'reading-list-'))` y la borra al terminar.
- Las pruebas que corren en el mismo proceso siempre pasan una ruta temporal, y ninguna depende de `HOME`.
- `test/bin.test.js` lanza procesos hijos con `HOME` y `USERPROFILE` apuntando a una carpeta temporal.

**`test/package.test.js`**

- `package.json` tiene `name`, `type`, `exports`, `bin`, `engines.node` y `scripts.test` con los valores de la sección 6.7.
- No tiene ninguna de las cuatro claves de dependencias.

**`test/books.test.js`**

- `add` sobre una lista vacía devuelve el libro 1, sin leer, y una lista con una sola entrada.
- `add` añade al final, con número igual a la longitud anterior más 1.
- `add` limpia los espacios, tabuladores y saltos de línea del título y del autor.
- `add` no modifica la lista que recibe.
- `add` lanza `INVALID_BOOK` si el título o el autor están vacíos, solo tienen espacios o no son strings.
- `add` lanza `DUPLICATE_BOOK` con el mismo libro aunque cambien las mayúsculas y los espacios. `error.book` es la entrada que ya existía, y el mensaje es `already in the list: 1. Rayuela — Julio Cortázar`.
- `add` de un duplicado leído da el mensaje `already read: 2. Ficciones — Jorge Luis Borges`.
- `add` trata como el mismo libro un nombre con la tilde compuesta y el mismo con la tilde descompuesta.
- `add` acepta el mismo título con otro autor.
- `markRead`:
  - marca la entrada y devuelve el libro con `read: true` y `alreadyRead: false`;
  - no modifica la lista que recibe;
  - conserva los campos extra de la entrada.
- `markRead` de un libro ya leído devuelve `alreadyRead: true` y la lista con el mismo contenido.
- `markRead` lanza `BOOK_NOT_FOUND` con 0, -1, 1.5, `NaN` y la longitud más 1. `error.number` es el valor recibido, y el mensaje para 0 es `no book number 0`.
- `pending` devuelve solo los no leídos, en orden, con su número de posición, aunque queden huecos.
- `formatBook` devuelve exactamente `3. Cien años de soledad — Gabriel García Márquez`.

**`test/store.test.js`**

- Si el archivo no existe, devuelve `[]`, y el archivo sigue sin existir.
- Guardar y después leer devuelve las mismas entradas.
- El texto guardado es exactamente `JSON.stringify(entries, null, 2) + '\n'`.
- Guardar reemplaza un archivo que ya existía.
- Después de guardar, en la carpeta solo queda el archivo de datos, sin ningún temporal.
- Si guardar falla (porque la ruta es una carpeta), la promesa se rechaza y no queda ningún temporal.
- Los campos extra de una entrada sobreviven a leer y guardar.
- Cada caso de archivo dañado rechaza con `CORRUPT_FILE`, con `error.file` igual a la ruta y el mensaje exacto. El archivo queda igual, byte a byte. Los casos son:
  - texto que no es JSON (`not valid JSON`);
  - `{}` (`not a JSON array`);
  - una entrada `null`, una entrada sin `title`, un `author` que no es string y `read: "yes"` (`entry <n> is not a valid book`, con la `n` correcta en cada caso).
- Leer una ruta que es una carpeta rechaza con el error original del sistema (`code` igual a `EISDIR`).

**`test/index.test.js`**

- `addBook` crea el archivo y devuelve el libro, y una llamada aparte a `listPending` lo devuelve.
- Con tres libros y el 2 marcado, `listPending` devuelve los números 1 y 3.
- `markRead` guarda `read: true` en el archivo y devuelve `{ book, alreadyRead: false }`.
- `markRead` de un libro ya leído devuelve `alreadyRead: true` y no escribe el archivo. La prueba pone antes el `mtime` del archivo en el pasado con `utimes`, y comprueba que no cambia.
- Un duplicado rechaza con `DUPLICATE_BOOK`, y el archivo no cambia.
- Si el archivo no existe:
  - `listPending` devuelve `[]`;
  - `markRead(file, 1)` rechaza con `BOOK_NOT_FOUND`;
  - el archivo sigue sin existir.
- Si el archivo está dañado, las tres funciones rechazan con `CORRUPT_FILE`, y el archivo no cambia.
- `src/index.js` exporta `formatBook`.

**`test/cli.test.js`**

- Llama a `main` con una ruta temporal, y con un `stdout` y un `stderr` que acumulan el texto.
- Prueba cada fila de la tabla de la sección 7:
  - la salida exacta va al flujo que toca, y el otro flujo queda vacío;
  - el código es el exacto;
  - en la fila "Otro error del sistema" (la ruta es una carpeta), basta con que stderr empiece por `reading-list: EISDIR` y el código sea 1.
- Comandos mal escritos: todos dan el texto de uso exacto en stderr, stdout vacío y código 2. Son `[]`, `['foo']`, `['--help']`, `['add']`, `['add', 'T']`, `['add', 'T', 'A', 'x']`, `['read']`, `['read', 'abc']`, `['read', '-1']`, `['read', '1.5']`, `['read', '1', '2']` y `['list', 'x']`.
- Un comando mal escrito no lee el archivo: con un archivo dañado, `['foo']` sigue dando 2.

**`test/bin.test.js`**

- Ejecuta `bin/reading-list.js` con `spawnSync(process.execPath, [ruta del bin, ...args])`, para usar el mismo Node que corre las pruebas. Lo lanza desde una carpeta temporal de trabajo, con `HOME` y `USERPROFILE` apuntando a otra carpeta temporal.
- `add "Rayuela" "Julio Cortázar"` escribe `Added: 1. Rayuela — Julio Cortázar\n` y devuelve 0. Después, `<HOME temporal>/.reading-list.json` contiene la entrada.
- Un proceso nuevo con `list` escribe `1. Rayuela — Julio Cortázar\n`.
- `read 1` escribe `Read: 1. Rayuela — Julio Cortázar\n`, y un `list` posterior no escribe nada.
- Sin argumentos, devuelve 2 y escribe el texto de uso en stderr.
- La primera línea del archivo es `#!/usr/bin/env node`.
- Fuera de Windows, el archivo tiene permiso de ejecución.

## 11. Límites conocidos

- Dos comandos lanzados exactamente a la vez pueden perder un cambio: los dos leen la misma lista, y gana el último que guarda. Como solo hay un usuario, no se protege.
- Guardar crea un archivo nuevo y lo pone en lugar del anterior. Por eso, si `~/.reading-list.json` fuera un enlace simbólico, quedaría sustituido por un archivo normal; y los permisos puestos a mano tampoco se conservan.
- La numeración depende de que nunca se quiten entradas. Si algún día se añade borrar, habrá que revisarla. Si alguien quita una entrada a mano, los números de las que van detrás bajan en uno.
- Un archivo vacío (0 bytes) cuenta como dañado (`not valid JSON`).
