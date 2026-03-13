# 📅 Calendário Premium — Componente Padrão DATI

## Visão Geral

O Calendário Premium é o componente padrão de seleção de datas da plataforma DATI Control.
Ele substitui os inputs nativos do browser por uma interface rica e consistente, usando **Flatpickr** como engine base + tema visual personalizado.

---

## Como Funciona

A função `initGlobalPickers()` em `js/modules/ui.js` é chamada automaticamente na inicialização
e sempre que um modal dinâmico é aberto. Ela detecta e transforma:

| Tipo de Input             | Comportamento                        |
|---------------------------|--------------------------------------|
| `input[type="date"]`      | Calendário apenas de data            |
| `input[type="datetime-local"]` | Calendário com seletor de hora  |
| `.datepicker`             | Classe auxiliar detectada também     |
| `.no-flatpickr`           | **Exceção** — mantém input nativo    |

---

## Uso nos Templates HTML/JS

### Input de data simples
```html
<input type="date" id="meu-campo-data" class="input-control">
```

### Input de data + hora
```html
<input type="datetime-local" id="meu-campo-datetime" class="input-control">
```

### Para EXCLUIR do calendário premium (manter nativo)
```html
<input type="date" id="audit-date" class="no-flatpickr">
```

---

## Funcionalidades do Componente

- **Tema visual escuro** alinhado com o design system DATI (`#0d1320` navy)
- **Seletor de mês** dropdown inline com lista de meses, sem nativo do browser
- **Seletor de ano** via campo numérico com scroll (roda do mouse) ou digitação direta
- **Botão "Hoje"** no rodapé para navegar rapidamente à data atual
- **Footer informativo** exibe a data selecionada por extenso (ex: "9 de março de 2026")
- **Dot indicator** (~) em azul embaixo do dia atual
- **Dia selecionado** destacado em roxo (`#5b52f6`)
- **Navegação por setas** (< >) para mês anterior/próximo
- **Locale pt-BR** nativo via plugin de localização do Flatpickr

---

## Arquivos Relacionados

| Arquivo                         | Função                                      |
|---------------------------------|---------------------------------------------|
| `js/modules/ui.js`              | Inicialização: `initGlobalPickers()`        |
| `css/components.css`            | Estilos: bloco `/* FLATPICKR PREMIUM THEME */` |

---

## Exceções Conhecidas

- **`audit-date-from` / `audit-date-to`** (`index.html`): mantidos como nativo com `color-scheme: dark` pois estão em contexto de filtro de auditoria técnica.
- **`audit-popover-from` / `audit-popover-to`** (`audit-log.js`): idem.

---

## Adicionando em Novos Módulos JS Dinâmicos

Ao injetar HTML via JS (modais, drawers, etc.), basta chamar `initGlobalPickers()` após inserir o HTML no DOM:

```js
// Depois de injetar o HTML do modal:
import { initGlobalPickers } from './ui.js';
initGlobalPickers();
```

O componente já tem proteção contra dupla inicialização via `el._flatpickr`.
