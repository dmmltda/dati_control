import { api } from './api.js';
import { DB_KEY } from './config.js';

export async function migrateFromLocalStorage() {
    const localData = localStorage.getItem(DB_KEY);
    if (!localData) return;

    try {
        const companies = JSON.parse(localData);
        if (!Array.isArray(companies) || companies.length === 0) return;

        console.log(`📦 Iniciando migração de ${companies.length} empresas para o PostgreSQL 10/10...`);

        for (const comp of companies) {
            // Mapeamento 1-para-1 do LocalStorage (Antigo) para DB (Novo/Fiel ao Excel)
            const mappedComp = {
                Nome_da_empresa: comp.nome || comp.name || 'Sem Nome',
                CNPJ_da_empresa: comp.cnpj || null,
                Status: comp.status || 'Prospect',
                Estado: comp.estado || null,
                Cidade: comp.cidade || null,
                Tipo_de_empresa: comp.tipo || null,
                Segmento_da_empresa: comp.segmento || null,
                Modo_da_empresa: comp.modo || null,
                
                // Mapeamento de Produtos
                Produtos: (comp.produtos || []).map(p => ({
                    Produto_DATI: p.nome || p.name,
                    Valor_Total: parseFloat(p.valor || p.value || 0)
                })),
                
                // Mapeamento de Contatos
                Contatos: (comp.contatos || []).map(c => ({
                    Nome_do_contato: c.nome || c.name,
                    Cargo_do_contato: c.cargo || c.role,
                    Departamento_do_contato: c.departamento || c.department,
                    Email_1: c.email,
                    WhatsApp: c.whatsapp,
                    LinkedIn: c.linkedin
                }))
            };

            console.log(`📤 Enviando: ${mappedComp.Nome_da_empresa}`);
            await api.createCompany(mappedComp);
        }

        console.log('✅ Migração 10/10 concluída com sucesso! Limpando LocalStorage...');
        localStorage.removeItem(DB_KEY);
        // Recarregar a página para o sistema começar a usar APENAS o banco
        window.location.reload();
    } catch (error) {
        console.error('❌ Erro crítico durante a migração:', error);
    }
}
