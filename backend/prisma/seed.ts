import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('Start seeding...');

  // 1. Seed Admin User
  const adminEmail = process.env.SEED_ADMIN_EMAIL || 'admin@gmail.com';
  const adminPassword = await bcrypt.hash(process.env.SEED_ADMIN_PASSWORD || 'admin123', 10);
  const admin = await prisma.user.upsert({
    where: { email: adminEmail },
    update: {},
    create: {
      email: adminEmail,
      name: 'System Admin',
      password: adminPassword,
      role: 'admin',
    },
  });
  console.log(`Created admin user: ${admin.email}`);

  // 2. Seed Categories
  const categoriesData = [
    { name: 'Travel', code: 'TRV' },
    { name: 'Meals', code: 'MLS' },
    { name: 'Office Supplies', code: 'ATK' },
    { name: 'Maintenance', code: 'MNT' }
  ];
  for (const cat of categoriesData) {
    await prisma.category.upsert({
      where: { code: cat.code },
      update: {},
      create: {
        name: cat.name,
        code: cat.code,
        is_active: true
      },
    });
    console.log(`Created category: ${cat.name}`);
  }

  // 3. Seed some People (Buyers/Requesters)
  const peopleData = ['John Doe', 'Jane Smith', 'Acme Corp'];
  for (const personName of peopleData) {
    const existingPerson = await prisma.person.findFirst({ where: { name: personName } });
    if (!existingPerson) {
      await prisma.person.create({
        data: {
          name: personName,
        },
      });
      console.log(`Created person: ${personName}`);
    }
  }

  console.log('Seeding finished.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
