# Regras Gerais do Agente – dati_control

## ⚡ Execução Automática de Comandos

**O usuário não é programador. Os agentes devem executar comandos automaticamente, sem pedir confirmação ("allow", "pode rodar?", etc.).**

- Todos os comandos de terminal considerados seguros para o projeto devem ser executados diretamente com `SafeToAutoRun: true`.
- Isso inclui: instalar dependências, rodar migrações, reiniciar o servidor, aplicar scripts, rodar builds, etc.
- **Não pergunte** se pode executar. Apenas execute e informe o resultado.
- Ações destrutivas irreversíveis (ex: apagar banco de produção, remover arquivos críticos) são a única exceção — nesse caso, avise antes de executar.

---


## 🚫 Testes no Navegador

**Os agentes NÃO devem abrir o navegador para testes de forma autônoma.**

- Nenhum agente deve iniciar sessões de browser (via `browser_subagent`, Playwright ou qualquer automação de navegador) sem permissão explícita do usuário.
- Ao concluir uma implementação, o agente deve **sempre perguntar ao usuário** se ele deseja realizar os testes no navegador por conta própria.
- A preferência do usuário é **fazer os testes visuais e funcionais ele mesmo**.

### ✅ Comportamento esperado

Após implementar uma mudança, o agente deve:
1. Descrever o que foi feito e o que deve ser testado.
2. Indicar como o usuário pode testar (ex: "Acesse `http://localhost:8000` e verifique...").
3. **Aguardar o feedback do usuário** antes de qualquer ação adicional.

### ❌ Comportamento proibido

- Abrir o navegador automaticamente para verificar resultados visuais.
- Executar testes de browser (Playwright, Puppeteer, etc.) sem autorização explícita.
- Navegar para URLs da aplicação sem permissão.

---

## 📋 Exceções

O agente **pode** usar o navegador apenas se:
- O usuário disser explicitamente: *"pode abrir o navegador"*, *"pode testar"*, *"faz o teste"* ou equivalente.
- A tarefa solicitada for exclusivamente de pesquisa em URLs externas (documentação, npm, etc.), não da aplicação local.
