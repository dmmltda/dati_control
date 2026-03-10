# Plano: Catálogo de Produtos DATI

## Estrutura
- `product_catalog` — tabela mestra dos produtos DATI (definições globais)
- O campo `Produto_DATI` em `company_products` referencia o nome do produto (sem FK para simplificar migração)

## Campos do Catálogo
- id, nome, descricao, categoria, status (Ativo/Inativo), icone, cor_badge, ordem, createdAt, updatedAt

## Entregáveis
1. Migração Prisma + schema update
2. Rotas CRUD no server/index.js
3. Nav item no sidebar
4. View HTML `view-catalogo-produtos` no index.html
5. Módulo JS `js/modules/catalogo-produtos.js`
6. Wiring no app.js
