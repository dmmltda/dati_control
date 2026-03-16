# Padrão de Design: Thread de E-mails Journey

Este documento define o padrão visual e de UX (10 de 10) para visualização de cadeias de e-mails/conversas no ecossistema DATI Journey. Use este guia para replicar a interface em outros sistemas.

## 1. Janela Modal (Container)

- **Overlay:** `background: rgba(2, 6, 23, 0.85)` com `backdrop-filter: blur(10px)`.
- **Card Background:** `#0f172a` (Navy Profundo) contrastando com o fundo `#020617`.
- **Elevation:** Borda de 1px `rgba(99,102,241,0.3)` com Glow suave de `box-shadow: 0 0 40px rgba(99,102,241,0.1)`.
- **Header:** Gradiente linear horizontal `rgba(99,102,241,0.15) 0%` para `transparent`.

## 2. Timeline e Sequência

- **Nódulos Numerados (#):** Quadrados com bordas arredondadas (8px), fundo com a cor do status (Verde ou Azul), texto branco em negrito.
- **Timeline Lane:** Linha vertical de 2px à esquerda, com gradiente partindo da cor do nódulo para transparente.
- **Espaçamento:** Padding lateral de 3.5rem para acomodar os indicadores.
- **Labels de De/Para e IA:** Fonte de 11.5px. Cor dos labels em `#cbd5e1` (cinza claro) e valores em `#ffffff` (Branco Forte/Contraste Máximo).

## 3. Badges de Status (Padrão Semântico)

- **ENVIADO (Outbound):** 
  - Cor: `#10b981` (Verde Esmeralda).
  - Ícone: `ph-paper-plane-tilt`.
  - Significado: Disparo automático ou manual realizado pelo sistema.
- **RECEBIDO (Inbound):** 
  - Cor: `#3b82f6` (Azul Royal).
  - Ícone: `ph-arrow-arc-left`.
  - Significado: Resposta direta do cliente/lead.

## 4. Renderização do Conteúdo

- **E-mails de Saída (HTML):**
  - Renderizados em um `<iframe>` com `srcdoc`.
  - Envolvidos em um container com borda `#e2e8f0` e header claro para simular um "documento/print" sobre o tema dark.
- **E-mails de Entrada (Texto):**
  - Bloco de texto limpo com `white-space: pre-wrap`.
  - Fundo sutil `rgba(255,255,255,0.03)` para legibilidade.

## 5. Inteligência IA (Gabi)

- **Bloco de Análise:** Fundo roxo translúcido com borda esquerda sólida (`primary-color`).
- **Campos:** Exibir Intenção, Ação Tomada, Resumo e Resposta Gerada (se houver) de forma estruturada.

---
*Este padrão garante consistência visual e autoridade de design em todo o suporte e monitoramento de e-mails.*
