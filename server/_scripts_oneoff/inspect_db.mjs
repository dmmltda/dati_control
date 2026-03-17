import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function checkNotifs() {
    const notifs = await prisma.notifications.findMany({
        orderBy: { created_at: 'desc' },
        take: 5
    });
    console.log('Last 5 notifications:', JSON.stringify(notifs, null, 2));
    
    const logs = await prisma.email_send_log.findMany({
        orderBy: { sent_at: 'desc' },
        take: 10
    });
    console.log('Last 10 email logs:', JSON.stringify(logs, null, 2));
    
    process.exit(0);
}

checkNotifs().catch(err => {
    console.error(err);
    process.exit(1);
});
