---
tags: [steam, trappola, debug]
---

# Due realm, due window

Il codice JavaScript del plugin gira in **`SharedJSContext`**. Il DOM che
produce vive nella finestra **Big Picture**. Sono due realm distinti con due
oggetti `window` diversi.

| | SharedJSContext | Big Picture |
| --- | --- | --- |
| `appStore` | ✓ | ✗ |
| `SteamUIStore` | ✓ | ✗ |
| `SteamClient` | ✓ | ✓ |
| React, Decky | ✓ | ✗ |
| Il DOM della pagina | ✗ | ✓ |

## Perché conta

Cercare la cosa giusta nel posto sbagliato dà **risposte sbagliate ma
convincenti**. Due esempi reali:

- ho concluso che `window.appStore` non esistesse, interrogando la finestra
  Big Picture. Esiste, ma nell'altro realm;
- ho letto un registratore di eventi in Big Picture ottenendo zero risultati,
  quando il codice che lo popolava girava in SharedJSContext.

In entrambi i casi il dato era corretto e la domanda era posta al posto
sbagliato.

## Regola pratica

- Serve il **DOM**, gli stili calcolati, `gpfocus`? → Big Picture
- Serve `appStore`, la navigazione, lo stato del plugin? → SharedJSContext

Vedi [[Parlare con il debugger di Steam]].
