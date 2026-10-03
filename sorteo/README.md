# Sorteo · Tarija Tech Week

Página web para el sorteo de premios del cierre de **Tarija Tech Week**. Sortea números dentro de un rango configurable (por defecto del **1 al 800**). El número ganador aparece en grande, con una animación de rodillos tipo tragamonedas, confeti y sonido.

No necesita instalación, servidor ni internet: se abre `index.html` en el navegador y listo.

## Uso rápido

1. Abre `index.html` en Chrome, Edge o Firefox. También puedes publicarlo con GitHub Pages.
2. La primera vez se abre la **configuración**:
   - Nombre del evento
   - Número mínimo y máximo (ej.: 1–800)
   - **Premios**, uno por línea y en el orden en que se sortean. Cada línea es un *pase* del sorteo. Para repetir un premio usa `x3`, por ejemplo `Polera x3`.
   - Números excluidos (opcional), por ejemplo `13, 100-110`
   - Duración de la animación, si un número puede ganar más de una vez, y si hay sonido
3. Pulsa **F** para pantalla completa y **Espacio** para sortear.

## Durante el sorteo

| Tecla / botón | Acción |
|---|---|
| `Espacio` / `Enter` | Sortear. Con un ganador en pantalla, pasa al siguiente premio |
| **Ausente · volver a sortear** | Anula al ganador (no está presente) y vuelve a sortear el mismo premio. Ese número ya no vuelve a salir |
| `G` / 🏆 | Panel de ganadores |
| `F` / ⛶ | Pantalla completa |
| `S` / 🔊 | Activar o silenciar el sonido |
| `C` / ⚙️ | Configuración |
| **Exportar CSV** | Descarga la lista de ganadores y anulados |

Al terminar todos los premios aparece la pantalla **¡Sorteo finalizado!** con la lista completa.

## Detalles

- **Aleatoriedad justa:** usa `crypto.getRandomValues` con muestreo por rechazo, así que no hay sesgo de módulo.
- **No se pierde nada:** la configuración y los resultados se guardan en el `localStorage` del navegador. Si se recarga la página o se cierra por error, el sorteo continúa donde quedó. Para empezar de cero: Configuración → **Reiniciar sorteo**.
- Por defecto, un número que ya salió (ganador o anulado) no vuelve a salir.

## Archivos

- `index.html`: estructura
- `styles.css`: estilos y animaciones
- `app.js`: lógica del sorteo
