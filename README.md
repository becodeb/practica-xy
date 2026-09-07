# El Operador de Grúa

Herramienta para que chicos de 3° grado entiendan el bloque **`cambiar x en (10)`**
de Scratch: qué eje tocan y qué significa el signo.

El problema real en el aula no es que no sepan sumar. Es que el bloque les pide
resolver dos cosas al mismo tiempo — *qué eje* (X horizontal, Y vertical) y *qué
sentido* (+ o −) — y encima lo dice con una palabra que no suena a movimiento
("cambiar"). Cuando no lo tienen automatizado, prueban al azar hasta que el gato
se mueve para donde querían, y eso no es programar.

La idea central: **desacoplar los dos ejes** y darles una metáfora física antes
de juntarlos en el plano completo. La escena es un depósito con una grúa
puente: un riel naranja arriba, un carro que corre por el riel, y una
plataforma colgada de dos cables. Tito, el operario, viaja en la plataforma.

- **El eje X es el Carro.** Solo corre por el riel de arriba: a la derecha o
  marcha atrás.
- **El eje Y es el Ascensor.** La plataforma solo sube y baja por los cables, y
  abajo del 0 está el pozo del sótano.
- **El ancla visual:** la X tiene los brazos abiertos a los costados. La Y tiene
  una patita larga para arriba y para abajo.

Y un segundo click mental que la app fuerza sola: **el número no es una posición
a la que teletransportarse, es cuántos pasos das desde donde ya estás parado.**

## Cómo usarlo

Abrí `index.html` con doble clic. Eso es todo.

No hay que instalar nada, no necesita internet, no necesita servidor ni compilar.
Funciona desde un pendrive. Está pensado para netbooks de escuela.

## La progresión

| Fase | Metáfora | Qué aísla |
|---|---|---|
| **El Carro** (4 niveles) | El carro corre por el riel del −5 al +5. Tito espera parado sobre pilas de cajones y hay que llevarlo de un cajón al otro. | Solo existe X. Lo único nuevo es el signo. |
| **El Ascensor** (4 niveles) | Un solo hueco vertical, del techo (+5) al pozo (−3), planta baja en el 0. Las pilas de cajones quedan a los costados. | Solo existe Y. El menos se vuelve físico: "bajar al pozo". |
| **La Grúa** (4 niveles) | Riel y cables a la vez, sobre un plano de 7×7. La estela del recorrido se dibuja **roja en X y azul en Y**. | Fusión de los dos ejes. |

### Las paradas van en orden

Cada nivel es una lista **ordenada de paradas** marcadas con un cuadrado verde.
Solo la próxima parada está iluminada; las otras esperan apagadas. La
plataforma tiene que frenar **exactamente** en esa parada: pasarle por encima
no cuenta.

Hay dos tipos. En una parada de **subida**, Tito camina desde su pila de
cajones a la plataforma (la parada queda justo al lado del cajón, en la misma
fila). En una de **bajada**, camina de la plataforma al cajón con el cartel
verde de salida. Cuando se hace la última parada, se gana.

Mientras Tito camina, **la corrida se detiene**: el programa no sigue hasta que
él terminó de subir o bajar. Eso hace visible que el bloque "hizo su trabajo"
antes de que arranque el siguiente.

## Un solo bloque por eje

Hay **un** bloque de `x` y **uno** de `y`, y el número lo escribe el chico —
igual que en Scratch. No hay bloques separados de `+1` y `-1`.

Eso tiene una consecuencia que conviene tener presente al dar la clase: **el
nivel no se gana tocando más bloques, se gana escribiendo bien el número.** La
paleta es un presupuesto de *tramos del viaje*, no de pasos: `t1` se resuelve
con un bloque, `g4` con cuatro. Si el chico escribe de más, el carro se sale
del riel (o a la plataforma se le acaba el cable) y la app se lo dice.

Y ahí aparece solo el error que importa. En `t4` el carro arranca en el **-2** y
Tito espera en el cajón del **2**, así que la plataforma tiene que frenar en el
**1**. El chico escribe `1`, porque "hay que ir al 1"… y la plataforma queda en
el -1. Ese es el momento de la clase. El bloque no dice a dónde ir, dice
**cuántos pasos dar desde donde ya está**.

Cada bloque trae `−` y `+` además del campo, y **cruzan el cero**: de 1 a 0 a -1.
Para una tablet eso importa, porque el teclado numérico de muchos Android e iOS
no trae la tecla del menos.

## La Traductora de Scratch

El botón de traducción (arriba a la derecha) abre un modo sandbox con cuatro
flechas: SUBIR, BAJAR, IZQ, DER. El chico aprieta para dónde quiere que camine
Tito y la app le muestra el bloque real de Scratch encastrándose, con los
números reales (`10`, `-10`), no los `+1` del juego.

> Para subir, la plataforma sube por los cables: `cambiar y en (10)`
> *No lo confundas con `fijar y a (10)`: ese lo manda al 10 de una, no lo mueve 10.*

**Ojo con una cosa antes de dar la clase.** Scratch tiene dos paquetes de
español y el bloque se llama distinto en cada uno:

| | Mover (relativo) | Posicionar (absoluto) |
|---|---|---|
| **Español Latinoamericano** (`es-419`) | `cambiar x en (10)` | `fijar x a (10)` |
| **Español (España)** (`es`) | `sumar a x (10)` | `dar a x el valor (10)` |

No es una palabra distinta: en el pack de España el eje se va al medio de la
frase. Abajo de la Traductora hay dos botones para elegir el paquete, y queda
guardado — cambia también las etiquetas de todos los bloques del juego. Elegí el
que ven ellos en la pantalla, o les estás enseñando una etiqueta que no van a
encontrar. (Los valores salen de `scratch-l10n`, `editor/blocks/es.json` y
`es-419.json`.)

Y la Traductora aprovecha para meter la cuña de la columna derecha de esa tabla:
cada vez que traduce un movimiento, avisa que **no** es lo mismo que el bloque
absoluto. `cambiar y en (10)` lo mueve 10; `fijar y a (10)` lo manda al 10. Esa
es la otra mitad de la confusión, y aparece apenas empiezan a mezclar bloques.

## Los controles

| Botón | Para qué sirve |
|---|---|
| **Jugar** | Corre la orden de trabajo completa con animación y sonido. Mientras corre dice **Pausa**, y tocarlo frena la corrida donde está. |
| **Un pasito** | Avanza **un solo evento**: un tramo de la plataforma, o Tito subiendo o bajando. Es la herramienta más importante: acá se ve cambiar el `x =` de a uno mientras el carro se mueve. |
| **Volver al principio** (la flecha circular) | Vuelve al principio sin borrar el programa. |
| **Sacar todo** (el tacho) | Saca todos los bloques. |
| **Mapa** | Elegir cualquier nivel. Nada está bloqueado: la seño decide el orden. |
| **Traductora** | El puente al bloque real de Scratch. |
| **Parlante** | Lee la consigna en voz alta. |
| **Campana** | Silencia todo. |

Para sacar un bloque, tocá la `×` del bloque.

## Cómo verificarlo

```bash
node tools/check-levels.js
```

Corre los 12 niveles contra el intérprete y verifica que la solución de cada uno
gane, entre en el presupuesto de bloques que se le da al chico y valga
exactamente 3 estrellas. También revisa la historia: que las paradas alternen
subida y bajada según dónde arranca Tito, que cada parada quede al lado del
cajón que le corresponde, y que ninguna pila de cajones tape el tablero. Si un
nivel y su respuesta se separan, falla acá y no en el aula.

Para la UI:

```bash
chromium --headless --no-sandbox --disable-gpu --allow-file-access-from-files \
  --virtual-time-budget=90000 --dump-dom "file://$PWD/tools/ui-smoke.html"
```

Levanta la app real en un iframe, arma programas, juega niveles, choca contra el
borde, usa el dial, recorre las paradas con "un pasito" y abre la Traductora.
También sirve `tools/ui-shot.html` para sacar capturas de un nivel puntual.

## Cómo está hecho

Vanilla JS con `<script>` clásicos, a propósito, para que abra desde `file://`.

- `js/engine.js` — el intérprete. Corre el programa entero y devuelve una traza
  de eventos, cada uno con una foto del mundo. No anima nada: por eso "un
  pasito", el reset y el replay salen gratis.
- `js/levels.js` — los 12 niveles y las tres metáforas, con la solución de cada
  nivel escrita al lado para que el checker la pueda correr. Cada nivel dice
  dónde arranca Tito, qué paradas hay y en qué orden, y dónde están las pilas
  de cajones.
- El campo del número es `type="text"` con `inputmode="numeric"`, **no**
  `type="number"`: un campo numérico reporta valor vacío mientras se está
  tecleando `-4`, así que el menos desaparece bajo los dedos del chico.
- `js/app.js` — la pantalla: la escena del depósito, la paleta, la orden de
  trabajo, los overlays y la Traductora. La escena se arma en píxeles desde
  JS y el navegador anima la plataforma y a Tito entre una posición y la otra.
- `js/audio.js` — pitidos de WebAudio y voz del navegador. Sin archivos.
- `assets/` — los PNG de la escena (pared, piso, riel, carro, cables,
  plataforma, cajones, la marca de parada y las hojas de sprites de Tito).
  Se cargan solo con `url()` relativos desde el CSS, que funciona desde
  `file://`. Salen de `tools/extract-assets.mjs`, que recorta la lámina de
  referencia y le saca el fondo blanco; no hace falta correrlo para jugar.

## Lo que todavía no tiene

- No hay modo "armá vos el desafío" para que la seño invente niveles sin tocar
  código.
- Los bloques se agregan al final y no se reordenan arrastrando: para cambiar el
  orden hay que sacar y volver a poner.
- El número se escribe en un campo, pero el bloque no se arrastra: se toca la
  paleta y se agrega al final. Scratch se arrastra.
- La progresión no está probada con chicos reales todavía. Los umbrales de
  estrellas y la cantidad de niveles por fase son una hipótesis.
