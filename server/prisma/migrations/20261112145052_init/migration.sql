-- CreateEnum
CREATE TYPE "EventType" AS ENUM ('CALL_STARTED', 'CALL_ENDED', 'CALL_FAILED');

-- CreateEnum
CREATE TYPE "CallStatus" AS ENUM ('STARTED', 'ENDED', 'FAILED', 'CONFLICTED');

-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'DEAD');

-- CreateTable
CREATE TABLE "accounts" (
    "id" UUID NOT NULL,
    "account_id" TEXT NOT NULL,
    "monthly_cap_seconds" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "call_events" (
    "id" UUID NOT NULL,
    "event_id" TEXT NOT NULL,
    "account_id" UUID NOT NULL,
    "call_id" TEXT NOT NULL,
    "event_type" "EventType" NOT NULL,
    "event_timestamp" TIMESTAMPTZ(3) NOT NULL,
    "received_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "duration_seconds" INTEGER NOT NULL,
    "cost_cents" INTEGER NOT NULL,
    "destination_country" TEXT,
    "payload" JSONB NOT NULL,
    "processed_at" TIMESTAMPTZ(3),

    CONSTRAINT "call_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "calls" (
    "id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "call_id" TEXT NOT NULL,
    "status" "CallStatus" NOT NULL DEFAULT 'STARTED',
    "started_at" TIMESTAMPTZ(3),
    "ended_at" TIMESTAMPTZ(3),
    "duration_seconds" INTEGER,
    "cost_cents" INTEGER,
    "destination_country" TEXT,
    "usage_month" DATE,
    "usage_applied_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "calls_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "monthly_usage" (
    "id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "month" DATE NOT NULL,
    "total_duration_seconds" INTEGER NOT NULL DEFAULT 0,
    "total_cost_cents" INTEGER NOT NULL DEFAULT 0,
    "completed_calls" INTEGER NOT NULL DEFAULT 0,
    "cap_seconds" INTEGER NOT NULL,
    "cap_exceeded_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "monthly_usage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "retry_jobs" (
    "id" UUID NOT NULL,
    "call_event_id" UUID NOT NULL,
    "status" "JobStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "next_retry_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "locked_at" TIMESTAMPTZ(3),
    "last_error" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "retry_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "accounts_account_id_key" ON "accounts"("account_id");

-- CreateIndex
CREATE UNIQUE INDEX "call_events_event_id_key" ON "call_events"("event_id");

-- CreateIndex
CREATE INDEX "call_events_account_id_event_timestamp_idx" ON "call_events"("account_id", "event_timestamp");

-- CreateIndex
CREATE INDEX "call_events_account_id_call_id_idx" ON "call_events"("account_id", "call_id");

-- CreateIndex
CREATE INDEX "calls_account_id_started_at_idx" ON "calls"("account_id", "started_at");

-- CreateIndex
CREATE INDEX "calls_account_id_usage_month_idx" ON "calls"("account_id", "usage_month");

-- CreateIndex
CREATE UNIQUE INDEX "calls_account_id_call_id_key" ON "calls"("account_id", "call_id");

-- CreateIndex
CREATE UNIQUE INDEX "monthly_usage_account_id_month_key" ON "monthly_usage"("account_id", "month");

-- CreateIndex
CREATE UNIQUE INDEX "retry_jobs_call_event_id_key" ON "retry_jobs"("call_event_id");

-- CreateIndex
CREATE INDEX "retry_jobs_status_next_retry_at_idx" ON "retry_jobs"("status", "next_retry_at");

-- AddForeignKey
ALTER TABLE "call_events" ADD CONSTRAINT "call_events_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "calls" ADD CONSTRAINT "calls_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "monthly_usage" ADD CONSTRAINT "monthly_usage_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "retry_jobs" ADD CONSTRAINT "retry_jobs_call_event_id_fkey" FOREIGN KEY ("call_event_id") REFERENCES "call_events"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
