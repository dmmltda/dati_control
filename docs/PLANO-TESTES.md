# 🧪 Plano de Testes E2E — dati_control
> Base URL: https://unnephritic-spirituously-davion.ngrok-free.dev/
> Framework: Playwright
> Atualizado: 2026-03-17

---

## 📊 Resumo de Cobertura

| Módulo | Testes Planejados | Status |
|--------|-------------------|--------|
| Auth | 8 | ⬜ pendente |
| Empresas | 45 | ⬜ pendente |
| Contatos de Empresa | 20 | ⬜ pendente |
| Produtos de Empresa | 20 | ⬜ pendente |
| Atividades | 25 | ⬜ pendente |
| Tasks (Kanban) | 30 | ⬜ pendente |
| WhatsApp Inbox | 20 | ⬜ pendente |
| Relatórios | 15 | ⬜ pendente |
| Configurações | 35 | ⬜ pendente |
| Gabi (IA) | 10 | ⬜ pendente |
| Importação | 10 | ⬜ pendente |
| Notificações | 8 | ⬜ pendente |
| Audit Log | 5 | ⬜ pendente |
| **TOTAL** | **~251** | |

---

## 1. AUTH (`auth.js`)

### 1.1 Login
- [ ] Login com email e senha corretos → redireciona para dashboard
- [ ] Login com senha incorreta → exibe mensagem de erro
- [ ] Login com email inexistente → exibe mensagem de erro
- [ ] Login com campo vazio → erro de validação
- [ ] Campo senha com toggle de visibilidade funciona
- [ ] "Esqueci a senha" redireciona corretamente

### 1.2 Logout
- [ ] Botão de logout encerra sessão
- [ ] Após logout, acessar URL protegida redireciona para login

---

## 2. EMPRESAS (`src/js/modules/empresas.js`)

### 2.1 Listagem
- [ ] Tabela carrega com dados
- [ ] Paginação funciona (próxima, anterior, última, primeira)
- [ ] Coluna de ordenação funciona (nome, data, status)
- [ ] Estado vazio exibe mensagem correta

### 2.2 Filtros
- [ ] Filtro por status (ativo, inativo, prospect, lead, proposta, em-contrato)
- [ ] Filtro por tokens base
- [ ] Busca por nome da empresa
- [ ] Combinação: status + busca
- [ ] Limpar filtros volta ao estado inicial
- [ ] Filtros persistem ao navegar entre páginas

### 2.3 Criar Empresa
- [ ] Modal de criação abre ao clicar no botão
- [ ] Campos obrigatórios validados (nome)
- [ ] Todos os campos preenchidos → salva com sucesso
- [ ] Empresa aparece na lista após criar
- [ ] Select de status funciona (todas as opções)
- [ ] Fechar modal sem salvar não cria empresa
- [ ] Campo de tokens base aceita número

### 2.4 Editar Empresa
- [ ] Clicar em empresa abre detalhes
- [ ] Dados carregam corretamente no formulário de edição
- [ ] Alterar nome → salva → lista atualiza
- [ ] Alterar status → salva → label atualiza
- [ ] Cancelar edição não salva mudanças

### 2.5 Excluir Empresa
- [ ] Botão de excluir exibe confirmação
- [ ] Confirmar exclusão remove da lista
- [ ] Cancelar exclusão mantém empresa

### 2.6 Empresa Interna (`empresa-interna.js`)
- [ ] Página de empresa interna carrega
- [ ] Dados da empresa interna exibidos corretamente

---

## 3. CONTATOS DE EMPRESA (`company-contacts/`)

### 3.1 Listagem
- [ ] Tabela de contatos carrega dentro da empresa
- [ ] Estado vazio exibe mensagem

### 3.2 Criar Contato
- [ ] Botão "Adicionar Contato" abre editor
- [ ] Campos: nome, email, telefone, cargo
- [ ] Salvar cria contato e aparece na tabela
- [ ] Email inválido é rejeitado
- [ ] Cancelar não cria contato

### 3.3 Editar Contato
- [ ] Clicar no contato abre editor com dados preenchidos
- [ ] Alterar dados → salvar → tabela atualiza
- [ ] Cancelar mantém dados originais

### 3.4 Excluir Contato
- [ ] Excluir com confirmação funciona
- [ ] Cancelar exclusão mantém contato

---

## 4. PRODUTOS DE EMPRESA (`company-products/`)

### 4.1 Listagem
- [ ] Tabela de produtos da empresa carrega
- [ ] Colunas: nome, valor, status

### 4.2 Criar/Editar/Excluir
- [ ] Criar produto com todos os campos
- [ ] Editar produto existente
- [ ] Excluir com confirmação
- [ ] Valor aceita formato de moeda

---

## 5. ATIVIDADES (`activities.js`)

### 5.1 Listagem
- [ ] Lista de atividades carrega
- [ ] Filtro por tipo de atividade
- [ ] Filtro por empresa
- [ ] Filtro por data (início e fim)
- [ ] Paginação funciona

### 5.2 Criar Atividade
- [ ] Modal de nova atividade abre
- [ ] Select de tipo funciona (call, email, reunião, etc.)
- [ ] Select de empresa funciona e filtra
- [ ] Campo de data/hora funciona
- [ ] Campo de descrição aceita texto longo
- [ ] Salvar cria atividade na lista

### 5.3 Editar/Excluir
- [ ] Editar atividade existente
- [ ] Excluir com confirmação

### 5.4 Log de Agendamento (`log-agendamento.js`)
- [ ] Log de agendamentos exibe corretamente
- [ ] Filtros funcionam

---

## 6. TASKS / KANBAN (`tasks-board.js`)

### 6.1 Board
- [ ] Board carrega com colunas (Backlog, Em andamento, Concluído, etc.)
- [ ] Cards aparecem nas colunas corretas
- [ ] Estado vazio de coluna exibe mensagem

### 6.2 Criar Task
- [ ] Botão "+" ou "Nova Task" abre modal
- [ ] Campos: título, descrição, responsável, empresa, prioridade, prazo
- [ ] Select de prioridade funciona (todas as opções)
- [ ] Select de responsável filtra usuários
- [ ] Data de prazo aceita input de data
- [ ] Salvar cria card na coluna correta

### 6.3 Mover Task
- [ ] Drag-and-drop move card entre colunas
- [ ] Status atualiza no backend após mover

### 6.4 Editar/Excluir Task
- [ ] Clicar no card abre detalhes
- [ ] Editar campos do card
- [ ] Excluir card com confirmação

---

## 7. WHATSAPP INBOX (`whatsapp-inbox.js`)

### 7.1 Listagem de Conversas
- [ ] Lista de conversas carrega
- [ ] Filtro por status (aberta, fechada, pendente)
- [ ] Filtro por empresa
- [ ] Busca por número/nome
- [ ] Badge de mensagens não lidas

### 7.2 Visualizar Conversa
- [ ] Clicar em conversa abre thread
- [ ] Mensagens exibidas em ordem cronológica
- [ ] Scroll funciona em conversas longas
- [ ] Data/hora das mensagens exibidas

### 7.3 Enviar Mensagem
- [ ] Campo de texto disponível
- [ ] Enviar mensagem aparece na thread
- [ ] Estado de enviado exibido

### 7.4 Configurações WhatsApp (`settings-whatsapp.js`)
- [ ] Página de configurações carrega
- [ ] Número de WhatsApp conectado exibido
- [ ] Status da conexão exibido

---

## 8. RELATÓRIOS

### 8.1 Monthly Report (`monthly-report.js`)
- [ ] Página carrega sem erro
- [ ] Seletor de mês/ano funciona
- [ ] Dados exibidos para o período selecionado
- [ ] Gráficos renderizam
- [ ] Export/download funciona (se disponível)

### 8.2 Adherence Report (`adherence-report.js`)
- [ ] Relatório de aderência carrega
- [ ] Filtros de período funcionam
- [ ] Dados calculados corretamente

### 8.3 Reports Gerais (`reports.js`)
- [ ] Cada tipo de relatório carrega
- [ ] Filtros específicos funcionam

---

## 9. CONFIGURAÇÕES

### 9.1 Usuários (`settings-users.js`, `src/js/modules/usuarios.js`)
- [ ] Lista de usuários carrega
- [ ] Convidar usuário (`modal-convidar.js`) — modal abre
- [ ] Invitation com email válido
- [ ] Invitation com email duplicado → erro
- [ ] Editar perfil de usuário
- [ ] Ativar/desativar usuário
- [ ] Remover usuário com confirmação

### 9.2 Permissões (`settings-permissions.js`, `modal-permissoes.js`)
- [ ] Tela de permissões carrega
- [ ] Toggle de permissão funciona
- [ ] Salvar permissões persiste
- [ ] Modal de permissões abre via botão
- [ ] Marcar/desmarcar permissões no modal
- [ ] Confirmar modal salva

### 9.3 Gabi — IA (`settings-gabi.js`)
- [ ] Configurações da Gabi carregam
- [ ] Campos de configuração editáveis
- [ ] Salvar configuração persiste

---

## 10. GABI — IA (`gabi.js`)

### 10.1 Chat
- [ ] Interface de chat carrega
- [ ] Enviar mensagem retorna resposta
- [ ] Histórico de conversa exibido
- [ ] Loading state durante processamento

---

## 11. IMPORTAÇÃO (`importer/import-manager.js`)

- [ ] Tela de importação carrega
- [ ] Upload de arquivo funciona
- [ ] Validação de formato (aceita .xlsx, .csv)
- [ ] Preview dos dados antes de importar
- [ ] Importar cria os registros
- [ ] Erros de importação exibidos claramente

---

## 12. CUSTOM SELECT (`custom-select.js`)

> Componente crítico — usado em todo o sistema

- [ ] Select abre ao clicar
- [ ] Select fecha ao clicar fora
- [ ] Opções listadas corretamente
- [ ] Selecionar opção atualiza o campo
- [ ] Select com busca filtra opções
- [ ] Select múltiplo seleciona várias opções
- [ ] Select desabilitado não abre
- [ ] Keyboard navigation funciona (setas, Enter, Escape)

---

## 13. NOTIFICAÇÕES (`notifications.js`)

- [ ] Sino de notificação carrega badge com contagem
- [ ] Clicar abre painel de notificações
- [ ] Notificações listadas em ordem
- [ ] Marcar como lida funciona
- [ ] Marcar todas como lidas funciona

---

## 14. AUDIT LOG (`audit.js`)

- [ ] Tela de audit log carrega
- [ ] Ações registradas exibidas
- [ ] Filtro por usuário funciona
- [ ] Filtro por data funciona
- [ ] Filtro por tipo de ação funciona

---

## 15. SMOKE TEST (roda em todo commit)

> Testa apenas o essencial em 30 segundos

- [ ] App carrega sem erro JS
- [ ] Login funciona
- [ ] Dashboard principal carrega
- [ ] Pelo menos 1 empresa visível
- [ ] Menu de navegação responde
- [ ] Logout funciona

---

## 📋 Ordem de Implementação (por prioridade)

```
Fase 1 — Críticos (implementar primeiro)
  ✅ smoke-test.spec.js
  ✅ auth.spec.js
  ✅ empresas-crud.spec.js
  ✅ custom-select.spec.js   ← afeta TODO o sistema

Fase 2 — Core do negócio
  ⬜ atividades.spec.js
  ⬜ tasks-kanban.spec.js
  ⬜ whatsapp-inbox.spec.js

Fase 3 — Configurações
  ⬜ settings-users.spec.js
  ⬜ settings-permissions.spec.js

Fase 4 — Relatórios e extras
  ⬜ reports.spec.js
  ⬜ importacao.spec.js
  ⬜ audit-log.spec.js
```

---

## 🛠️ Como rodar

```bash
# Todos os testes
npx playwright test

# Só smoke test
npx playwright test smoke-test

# Um módulo específico
npx playwright test empresas

# Com UI visual
npx playwright test --ui

# Com report HTML
npx playwright test --reporter=html
```

---

## ⚙️ Configuração do playwright.config.js

```javascript
baseURL: 'https://unnephritic-spirituously-davion.ngrok-free.dev/'
```
