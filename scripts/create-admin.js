'use strict';

require('dotenv').config();

const prisma = require('../lib/prisma');
const {
  normalizeAdminEmail,
  hashAdminPassword,
} = require('../lib/admin-auth');

function readRequiredEnv(name) {
  const value = String(process.env[name] || '').trim();

  if (!value) {
    throw new Error(`В .env не заполнена переменная ${name}.`);
  }

  return value;
}

async function main() {
  console.log('Создание администратора «Ландшафт Парк» из .env');

  const name = readRequiredEnv('ADMIN_NAME');
  const email = normalizeAdminEmail(readRequiredEnv('ADMIN_EMAIL'));
  const password = readRequiredEnv('ADMIN_PASSWORD');

  if (!email || !email.includes('@') || email.length > 254) {
    throw new Error('В ADMIN_EMAIL указан некорректный email.');
  }

  const existingAdmin = await prisma.adminUser.findUnique({
    where: {
      email,
    },
    select: {
      id: true,
    },
  });

  if (existingAdmin) {
    throw new Error(
      'Администратор с таким email уже существует. Пароль автоматически не перезаписан.',
    );
  }

  const passwordHash = await hashAdminPassword(password);

  const admin = await prisma.adminUser.create({
    data: {
      name,
      email,
      passwordHash,
      role: 'OWNER',
      isActive: true,
    },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      isActive: true,
    },
  });

  console.log('Администратор создан:');
  console.log(`${admin.name} <${admin.email}> [${admin.role}]`);
  console.log('Теперь удалите ADMIN_NAME, ADMIN_EMAIL и ADMIN_PASSWORD из .env.');
}

main()
  .catch((error) => {
    console.error(error.message || error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
