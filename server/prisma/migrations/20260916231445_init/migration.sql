-- CreateEnum
CREATE TYPE "ShiftStatus" AS ENUM ('ASSIGNED', 'CONFIRMED', 'DECLINED', 'SERVED');

-- CreateTable
CREATE TABLE "admins" (
    "id" TEXT NOT NULL,
    "clerkId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "avatarUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "admins_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ushers" (
    "id" TEXT NOT NULL,
    "clerkId" TEXT,
    "adminId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "avatarUrl" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ushers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "worship_services" (
    "id" TEXT NOT NULL,
    "adminId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "location" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "worship_services_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shifts" (
    "id" TEXT NOT NULL,
    "usherId" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "status" "ShiftStatus" NOT NULL DEFAULT 'ASSIGNED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shifts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rotation_queue" (
    "id" TEXT NOT NULL,
    "adminId" TEXT NOT NULL,
    "usherId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rotation_queue_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "admins_clerkId_key" ON "admins"("clerkId");

-- CreateIndex
CREATE UNIQUE INDEX "admins_email_key" ON "admins"("email");

-- CreateIndex
CREATE UNIQUE INDEX "ushers_clerkId_key" ON "ushers"("clerkId");

-- CreateIndex
CREATE UNIQUE INDEX "ushers_email_key" ON "ushers"("email");

-- CreateIndex
CREATE UNIQUE INDEX "shifts_usherId_serviceId_key" ON "shifts"("usherId", "serviceId");

-- CreateIndex
CREATE UNIQUE INDEX "rotation_queue_usherId_key" ON "rotation_queue"("usherId");

-- CreateIndex
CREATE UNIQUE INDEX "rotation_queue_adminId_position_key" ON "rotation_queue"("adminId", "position");

-- AddForeignKey
ALTER TABLE "ushers" ADD CONSTRAINT "ushers_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "admins"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "worship_services" ADD CONSTRAINT "worship_services_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "admins"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shifts" ADD CONSTRAINT "shifts_usherId_fkey" FOREIGN KEY ("usherId") REFERENCES "ushers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shifts" ADD CONSTRAINT "shifts_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "worship_services"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rotation_queue" ADD CONSTRAINT "rotation_queue_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "admins"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rotation_queue" ADD CONSTRAINT "rotation_queue_usherId_fkey" FOREIGN KEY ("usherId") REFERENCES "ushers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
