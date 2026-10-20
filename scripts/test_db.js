const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const session = await prisma.session.findUnique({
    where: { id: 'ddf70356-f3da-4913-bf06-13f550f80389' },
    include: { scorecard: true },
  });
  console.log('SESSION:', JSON.stringify(session, null, 2));
}

main()
  .catch((e) => console.error(e))
  .finally(async () => {
    await prisma.$disconnect();
  });
