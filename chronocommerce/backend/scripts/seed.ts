import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const users = [
  { email: 'admin@chrono.test', fullName: 'Admin', role: 'ADMIN' as const },
  { email: 'manager@chrono.test', fullName: 'Manager', role: 'MANAGER' as const },
  { email: 'customer@chrono.test', fullName: 'Customer', role: 'CUSTOMER' as const },
];
(async () => {
  for (const u of users) {
    await prisma.user.upsert({ where: { email: u.email }, update: {}, create: { ...u, passwordHash: await bcrypt.hash('Password123!', 12) } });
  }
  console.log('Seeded users (password: Password123!):', users.map((u) => u.email).join(', '));
  await prisma.$disconnect();
})();
