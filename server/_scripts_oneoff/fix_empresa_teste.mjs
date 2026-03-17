import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'crypto';

const prisma = new PrismaClient();

async function fixEmpresaTeste() {
    // Buscar a empresa Empresa Teste
    const empresa = await prisma.companies.findFirst({
        where: { Nome_da_empresa: { contains: 'Empresa Teste', mode: 'insensitive' } },
        select: { id: true, Nome_da_empresa: true }
    });
    
    console.log('Empresa encontrada:', empresa);
    
    if (!empresa) {
        console.log('Empresa Teste não encontrada no banco.');
        await prisma.$disconnect();
        return;
    }
    
    // Buscar todos os usuários
    const usuarios = await prisma.users.findMany({
        select: { id: true, email: true, user_type: true, nome: true }
    });
    
    console.log('Usuários no banco:', usuarios.map(u => `${u.nome} (${u.email}) - ${u.user_type}`));
    
    // Para cada standard, verificar e criar membership se necessário
    for (const usuario of usuarios) {
        const existing = await prisma.user_memberships.findUnique({
            where: { user_id_company_id: { user_id: usuario.id, company_id: empresa.id } }
        });
        
        if (existing) {
            console.log(`Membership já existe para ${usuario.nome} (${usuario.email})`);
        } else {
            const membership = await prisma.user_memberships.create({
                data: {
                    id: randomUUID(),
                    user_id: usuario.id,
                    company_id: empresa.id,
                    can_create: true,
                    can_edit: true,
                    can_delete: true,
                    can_export: true,
                    updatedAt: new Date()
                }
            });
            console.log(`✅ Membership criado para ${usuario.nome} (${usuario.email}):`, membership.id);
        }
    }
    
    await prisma.$disconnect();
}

fixEmpresaTeste().catch(console.error);
