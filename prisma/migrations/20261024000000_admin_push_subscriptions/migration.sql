-- Push subscriptions belong to an admin session. On logout/expiry purge,
-- the session cascade revokes delivery automatically.
CREATE TABLE "AdminPushSubscription" (
  "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  "sessionId" INTEGER NOT NULL,
  "endpoint" TEXT NOT NULL,
  "p256dh" TEXT NOT NULL,
  "auth" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "AdminPushSubscription_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "AdminSession" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "AdminPushSubscription_endpoint_key" ON "AdminPushSubscription"("endpoint");
CREATE INDEX "AdminPushSubscription_sessionId_idx" ON "AdminPushSubscription"("sessionId");
