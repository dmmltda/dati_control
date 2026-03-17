# CSS — Estrutura de Estilos

## Sistema ativo (produção)

Os arquivos na raiz de `css/` são carregados diretamente pelo `index.html`:

| Arquivo | Função |
|---|---|
| `variables.css` | Variáveis CSS globais (cores, radii, status) |
| `global.css` | Reset e estilos base |
| `components.css` | Todos os componentes reutilizáveis (~84 KB) |
| `layout.css` | Sidebar, main, shell do app |
| `views.css` | Estilos das views/páginas |
| `import.css` | Tela e modal de importação |
| `agendamento.css` | Componente de agendamento |

## Sistema novo (_design-system/)

A pasta `_design-system/` contém um sistema de design tokens mais moderno,
criado em paralelo durante a refatoração de `src/`.

- Usa nomes de variáveis mais semânticos (`--dark-900`, `--indigo`, `--text-1`)
- Mais modular e legível
- **Não está ativo em produção** — não é carregado pelo `index.html`

### Plano de migração (Fase 4+)

Quando for feita a refatoração dos módulos grandes (`components.css` → módulos),
o sistema `_design-system/` deve ser adotado como base,
migrando as variáveis CSS aos poucos.
