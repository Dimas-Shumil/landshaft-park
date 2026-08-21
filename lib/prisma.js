'use strict';

const { PrismaClient } = require('@prisma/client');

const prisma =
  global.__landshaftParkPrisma ||
  new PrismaClient();

if (process.env.NODE_ENV !== 'production') {
  global.__landshaftParkPrisma = prisma;
}

module.exports = prisma;
