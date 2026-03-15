# Tutorial Recorder — Journey CRM

Este serviço grava vídeos `.webm` reais da UI do Journey para usar nas tooltips de tutorial.

## Como funciona

```
tutorials.config.js  →  record.js (Playwright)  →  assets/tutorials/*.webm  →  tooltip <video>
```

## Pré-requisitos

1. **Servidor rodando localmente:**
   ```bash
   node server/index.js
   ```

2. **Sessão de login salva** (gerada automaticamente pelos testes E2E):
   ```bash
   npx playwright test --project=setup
   ```
   Isso cria `js/tests/e2e/fixtures/.auth/master.json` com a sessão autenticada.

## Gravando tutoriais

```bash
# Gravar todos os tutoriais
npm run record-tutorials

# Gravar apenas um tutorial específico
npm run record-tutorials filtro-empresas
```

Os vídeos são salvos em `assets/tutorials/`.

## Adicionando um novo tutorial

1. Abra `tutorials.config.js`
2. Adicione um objeto no array `TUTORIALS`:

```js
{
  id:        'nome-do-tutorial',
  descricao: 'Descrição do que mostra',
  saida:     'assets/tutorials/nome-do-tutorial.webm',
  passos: [
    { acao: 'navegar',      destino: '/#company-list' },
    { acao: 'aguardar',     ms: 800 },
    { acao: 'clicar',       seletor: '.meu-botao' },
    { acao: 'aguardar_sel', seletor: '.modal-aberto' },
    { acao: 'digitar',      seletor: '#meu-campo', texto: 'Texto de exemplo' },
  ]
}
```

3. Rode `npm run record-tutorials nome-do-tutorial`
4. O vídeo aparece em `assets/tutorials/nome-do-tutorial.webm`

## Ações disponíveis nos passos

| Ação | Parâmetros | O que faz |
|------|-----------|-----------|
| `navegar` | `destino` | Navega para URL |
| `aguardar` | `ms` | Pausa N milissegundos |
| `aguardar_sel` | `seletor`, `timeout` | Aguarda elemento aparecer |
| `mover_mouse` | `x`, `y` | Move o cursor para coordenadas absolutas |
| `mover_mouse_para` | `seletor`, `offset` | Move o cursor para o centro de um elemento |
| `clicar` | `seletor` | Clica em um elemento |
| `clicar_texto` | `seletor`, `texto` | Clica no elemento que contém o texto |
| `digitar` | `seletor`, `texto` | Digita letra a letra (efeito visual) |
| `scroll` | `delta` | Rola a página |
| `pressionar` | `tecla` | Pressiona uma tecla (ex: `Escape`) |

## Usando o vídeo na tooltip

Após gerar o vídeo, substitua o `<canvas>` na tooltip por:

```html
<video
  src="assets/tutorials/filtro-empresas.webm"
  autoplay muted loop playsinline
  style="width:100%; display:block; border-radius: 0;"
></video>
```
