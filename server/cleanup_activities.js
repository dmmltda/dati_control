import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();
p.activities.findMany({
    where: { title: '[Intervenção IA] Analisar resposta de e-mail' },
    select: { id: true, created_at: true, description: true },
    orderBy: { created_at: 'asc' }
}).then(cards => {
    console.log('Total:', cards.length);
    cards.forEach((c, i) => {
        const m = c.description?.includes('[EMAIL_LOG:') ? '✅ TEM MARCADOR' : '❌ SEM MARCADOR';
        console.log(i+1, c.id.slice(0,8), m);
    });
    // Remove os sem marcador (logs velhos)
    const toDelete = cards.filter(c => !c.description?.includes('[EMAIL_LOG:')).map(c=>c.id);
    if (toDelete.length > 0) {
        return p.activity_assignees.deleteMany({ where: { activity_id: { in: toDelete } } })
            .then(() => p.activities.deleteMany({ where: { id: { in: toDelete } } }))
            .then(r => console.log('Deletados', r.count, 'cards antigos sem marcador'));
    }
}).then(()=>p.$disconnect()).catch(console.error);
