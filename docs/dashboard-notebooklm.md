# DATI Control — Documentação do Dashboard para Podcast

## O que é o DATI Control?

O DATI Control é um CRM (Customer Relationship Management) desenvolvido internamente pela DATI para gerenciar o relacionamento com seus clientes de forma inteligente e centralizada. A plataforma reúne em uma única interface todas as informações operacionais e estratégicas necessárias para os times de Customer Success, Help Desk, Vendas e Financeiro atuarem de forma alinhada e orientada a dados.

O sistema foi construído com tecnologia moderna: frontend em JavaScript puro com arquitetura modular, backend em Node.js com Express, banco de dados PostgreSQL, autenticação via Clerk, e integração com Inteligência Artificial através da assistente Gabi.

---

## A Tela de Dashboard

A tela de Dashboard é o coração do DATI Control. É a primeira tela que o usuário vê ao entrar no sistema e funciona como um painel de controle completo, trazendo uma visão consolidada de todas as operações da empresa em tempo real.

O dashboard é personalizado por departamento: cada time (CS, Help Desk, Vendas, Financeiro, Master) vê os painéis mais relevantes para sua função em destaque, mas pode acessar e reorganizar todos os demais. Cada usuário também pode personalizar quais painéis quer exibir ou ocultar, e essa preferência fica salva automaticamente.

A tela é organizada em um grid responsivo com dois tipos de layout: painéis em largura total (para informações mais densas) e painéis em meia largura (para métricas laterais complementares).

---

## Os 6 Painéis do Dashboard

### 1. KPI Cards — Os Indicadores-Chave

O primeiro painel é o de KPIs (Key Performance Indicators), os indicadores-chave do negócio. Ele exibe cinco métricas principais em cards destacados:

- **Total de Empresas**: quantas empresas estão cadastradas no sistema no total.
- **Clientes Ativos**: quantas empresas estão com status ativo ou em operação.
- **Leads Qualificados**: quantas empresas estão no pipeline de vendas, ou seja, em fase de prospecção, negociação ou reunião.
- **Novos no Mês**: quantas empresas foram adicionadas no mês corrente.
- **Inativos / Suspensos**: quantas empresas estão inativas ou com o contrato suspenso.

Cada card exibe o número principal em destaque e, abaixo, a variação em relação ao mês anterior — com seta verde para cima quando o resultado é positivo e seta vermelha para baixo quando negativo. Isso permite ao gestor identificar rapidamente tendências sem precisar abrir relatórios.

---

### 2. Próximos Passos — Minhas Atividades

O segundo painel traz as atividades atribuídas ao usuário logado no sistema. É a agenda de trabalho do profissional dentro do CRM.

Cada atividade aparece em formato de tabela com as seguintes informações:
- **Título da atividade**: o que precisa ser feito.
- **Empresa relacionada**: a qual cliente aquela tarefa pertence.
- **Data prevista**: quando a atividade deve ocorrer.
- **Status de exibição**: um indicador visual que classifica a atividade em:
  - **Atrasada** (em vermelho): a data já passou e a tarefa não foi concluída.
  - **Hoje** (em amarelo): a atividade é para o dia atual.
  - **Pendente** (em cinza): ainda não tem data ou está no futuro.
  - **Concluída** (em verde): já foi finalizada.
  - **Cancelada** (em cinza escuro): foi cancelada.

O painel usa codificação por cores nas bordas laterais de cada linha para facilitar a leitura rápida. Ao clicar em qualquer atividade, abre-se um modal com todos os detalhes: descrição, histórico, responsáveis, lembretes e próximos passos.

Os tipos de atividade suportados incluem: comentários, reuniões, chamados de Help Desk, chamados de CS e ações necessárias.

---

### 3. Funil de Vendas

O terceiro painel é o funil de vendas, que mostra visualmente o pipeline comercial da empresa em cinco estágios:

1. **Prospects**: empresas identificadas como potencial cliente, ainda em fase inicial de contato.
2. **Leads Qualificados**: prospects que já demonstraram interesse concreto.
3. **Em Reunião**: leads com reunião agendada ou em andamento.
4. **Proposta Enviada**: clientes que receberam uma proposta comercial formal.
5. **Clientes Ativos**: empresas que já fecharam contrato e estão em operação.

Para cada estágio do funil, o sistema exibe:
- Quantidade de empresas naquele estágio.
- Receita Mensal Recorrente (MRR) estimada somada para o grupo.
- Taxa de conversão em relação ao estágio anterior (em percentual).

As barras horizontais têm largura proporcional ao volume de cada estágio, tornando visualmente imediato onde está a maior concentração de oportunidades. Ao passar o mouse sobre cada barra, um tooltip aparece listando as empresas, o responsável e a receita estimada de cada uma.

---

### 4. Health Score — Saúde dos Clientes

O quarto painel apresenta a saúde da base de clientes ativos, dividida em três categorias:

- **Saudável** (verde): clientes com bom engajamento, NPS alto e sem alertas críticos.
- **Em Atenção** (amarelo/laranja): clientes que apresentam algum sinal de risco — queda de uso, NPS médio ou tickets frequentes.
- **Em Risco** (vermelho): clientes com alto potencial de churn (cancelamento), com NPS baixo ou problemas não resolvidos.

Esse painel usa um gráfico de rosca (donut chart) interativo. O centro do gráfico mostra o total de clientes ativos, e cada fatia representa uma das três categorias de saúde, com a contagem e o percentual correspondentes.

Abaixo do gráfico, há uma tabela com os 5 clientes de menor NPS entre os ativos — ou seja, os que mais merecem atenção imediata do time de Customer Success.

O NPS (Net Promoter Score) é uma métrica internacional que mede a satisfação e lealdade do cliente em uma escala de -100 a +100. Clientes com NPS muito baixo têm maior probabilidade de cancelar o serviço.

---

### 5. Help Desk — Suporte Técnico

O quinto painel monitora os chamados de suporte técnico abertos na empresa. Ele exibe três mini-cards de status:

- **Abertos**: quantidade de tickets aguardando atendimento.
- **Em Andamento**: tickets sendo tratados no momento.
- **Tempo Médio**: tempo médio de resolução dos chamados (em horas).

Além dos cards, o painel exibe um gráfico de linha mostrando a evolução ao longo dos últimos 7 dias — chamados abertos (linha vermelha) versus chamados resolvidos (linha verde). Isso permite visualizar tendências de carga de trabalho.

Na parte inferior, aparece a lista de chamados críticos — os tickets com maior prioridade que exigem atenção urgente.

Esse painel está integrado ao sistema de Help Desk da DATI e será expandido com dados em tempo real conforme a integração avança.

---

### 6. Onboarding — Integração de Novos Clientes

O sexto painel acompanha o processo de onboarding — a etapa de integração e implantação de novos clientes.

Na parte superior, três métricas resumidas:
- **Total de onboardings** em andamento.
- **Atrasados**: quantos processos estão fora do prazo.
- **Progresso médio**: percentual médio de conclusão do onboarding em toda a base.

Abaixo, uma lista detalhada dos onboardings atrasados, com:
- Nome da empresa e responsável.
- Dias de atraso desde o início previsto.
- Barra de progresso visual (colorida por estágio):
  - Vermelho: menos de 40% concluído.
  - Amarelo: entre 40% e 74%.
  - Verde: 75% ou mais.
- Data prevista para conclusão.

Onboardings com mais de 60 dias de atraso são marcados com uma borda vermelha de alerta crítico.

---

## Funcionalidades Transversais do Sistema

Além dos painéis do dashboard, o DATI Control conta com uma série de funcionalidades que estão disponíveis em toda a plataforma:

### Gabi — Assistente de Inteligência Artificial

A Gabi é a assistente de IA integrada ao sistema, acessível pelo botão de chat flutuante em qualquer tela. Ela utiliza o modelo de linguagem avançado da Anthropic (Claude) e pode:

- Responder perguntas sobre os dados do CRM.
- Sugerir próximos passos com base em atividades atrasadas ou clientes em risco.
- Analisar imagens enviadas pelo usuário (capturas de tela, documentos).
- Criar atividades no sistema automaticamente com base na conversa.
- Resumir situações de clientes com baixo NPS.

A Gabi responde de forma progressiva (streaming), exibindo as palavras em tempo real enquanto processa a resposta.

---

### Notificações em Tempo Real

O sistema possui um sino de notificações no topo da interface. As notificações são geradas automaticamente para eventos como:

- Lembrete de atividade com prazo se aproximando.
- Atribuição de uma atividade de próximo passo para o usuário.
- Disponibilidade de gravação de reunião no Google Meet.
- Menção do usuário em comentários.

---

### Integrações com WhatsApp

O DATI Control possui uma caixa de entrada do WhatsApp integrada, onde é possível visualizar conversas de suporte, responder mensagens diretamente pelo sistema e classificar o sentimento do cliente (temperatura: Crítico, Negativo, Neutro, Positivo, Encantado).

---

### Quadro de Tarefas Pessoais (Kanban)

Além do painel "Próximos Passos" no dashboard, existe uma tela dedicada ao quadro de tarefas pessoais no formato Kanban, com quatro colunas:

- **A Fazer**: tarefas pendentes não iniciadas.
- **Em Andamento**: tarefas em execução.
- **Concluída**: tarefas finalizadas.
- **Cancelada**: tarefas descartadas.

O quadro suporta arrastar e soltar entre colunas, filtros por status, prioridade e data, além de um cronômetro integrado para registrar o tempo gasto em cada atividade.

---

### Relatórios

A tela de relatórios permite exportar dados de toda a base de empresas em formato CSV ou XLSX. O usuário pode selecionar mais de 30 colunas diferentes para compor o relatório, incluindo campos como NPS, Health Score, data de início do CS, motivo de churn, produtos contratados, entre outros. Os filtros avançados permitem cruzar variáveis como segmento, status, período e responsável.

---

### Log de Auditoria

Toda ação realizada no sistema — criação, edição ou exclusão de dados — é registrada automaticamente no log de auditoria. Esse registro inclui quem fez a ação, quando, o que mudou (valores antes e depois) e qual entidade foi afetada. O log se atualiza a cada 30 segundos e oferece filtros por tipo de ação, usuário, entidade e período.

---

### Relatório Mensal de Aderência

Para cada empresa, é possível gerar um relatório mensal de aderência, que mostra:
- As rotinas realizadas no mês.
- O percentual de aderência geral.
- Os chamados abertos e resolvidos.
- As horas de Help Desk utilizadas.

Esse relatório é visualizado diretamente na aba da empresa e futuramente será enviado automaticamente via WhatsApp para o cliente.

---

## Controle de Permissões

O sistema possui dois perfis de usuário:

- **Master**: acesso completo a todos os dados, todas as empresas e todas as funcionalidades administrativas, incluindo gestão de usuários, configurações de IA e log de auditoria.
- **Standard**: acesso apenas às empresas e atividades às quais está vinculado. Pode ter permissões adicionais concedidas individualmente pelo Master.

As permissões são baseadas em funcionalidades específicas (ex: `dashboard.view`, `companies.view`, `reports.export`), permitindo controle granular sobre o que cada usuário pode ver e fazer.

---

## Tecnologia e Arquitetura

O DATI Control foi desenvolvido com uma arquitetura moderna e escalável:

- **Frontend**: JavaScript puro (sem frameworks pesados), HTML5, CSS3, organizado em módulos independentes. Isso garante alta performance e carregamento rápido.
- **Backend**: Node.js com Express.js, estruturado em rotas, middlewares e serviços.
- **Banco de Dados**: PostgreSQL com Prisma ORM para migrações e queries tipadas.
- **Autenticação**: Clerk, com suporte a SSO e múltiplos provedores de login.
- **Filas de Job**: pg-boss para processamento assíncrono de notificações e lembretes automáticos.
- **Automação**: cron jobs executados a cada 5 minutos para lembretes de atividade, notificações de prazo e sincronização de gravações do Google Meet.
- **IA**: integração com a API da Anthropic (Claude), com suporte a visão computacional para análise de imagens.
- **Tempo Real**: Server-Sent Events (SSE) para streaming de mensagens do WhatsApp e notificações ao vivo.

---

## Resumo dos Benefícios

O Dashboard do DATI Control entrega, em uma única tela, uma visão 360° da operação:

1. **Para o gestor**: acompanhamento dos KPIs de negócio, saúde da base de clientes e pipeline de vendas em tempo real.
2. **Para o time de CS**: visibilidade das atividades pendentes, alertas de clientes em risco e histórico de onboarding.
3. **Para o Help Desk**: monitoramento de chamados abertos, tempo de resposta e tickets críticos.
4. **Para vendas**: funil visual com taxas de conversão e MRR estimado por estágio.
5. **Para todos**: uma ferramenta de trabalho diário que centraliza atividades, comunicação e inteligência de dados em um único lugar.

O DATI Control é o sistema que transforma dados dispersos em decisões rápidas e assertivas.

---

*Documentação gerada para uso no NotebookLM — DATI, março de 2026.*
