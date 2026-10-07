-- 1 Oct 2026 #8: only one member of staff may have the Add Client form open at a time.
-- A single-row mutex (id is always 'ADD_CLIENT'), kept alive by the open form's heartbeat
-- and treated as free once the heartbeat goes stale — see clientCreationLock.service.ts.
CREATE TABLE "client_creation_locks" (
    "id" TEXT NOT NULL,
    "holderId" TEXT NOT NULL,
    "holderName" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "acquiredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "heartbeatAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "client_creation_locks_pkey" PRIMARY KEY ("id")
);
