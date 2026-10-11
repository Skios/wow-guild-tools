-- CreateEnum
CREATE TYPE "WoWClass" AS ENUM ('WARRIOR', 'PALADIN', 'HUNTER', 'ROGUE', 'PRIEST', 'SHAMAN', 'MAGE', 'WARLOCK', 'DRUID', 'DEATHKNIGHT', 'MONK', 'EVOKER');

-- CreateEnum
CREATE TYPE "WoWRole" AS ENUM ('TANK', 'HEALER', 'DPS');

-- AlterEnum
ALTER TYPE "ResponseStatus" ADD VALUE 'BENCH';

-- AlterTable
ALTER TABLE "characters" ADD COLUMN     "class" "WoWClass" NOT NULL DEFAULT 'WARRIOR',
ADD COLUMN     "role" "WoWRole" NOT NULL DEFAULT 'DPS';

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "preferredChannel" TEXT DEFAULT 'telegram';

-- CreateTable
CREATE TABLE "roster_groups" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "roster_groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "group_members" (
    "userId" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "group_members_pkey" PRIMARY KEY ("userId","groupId")
);

-- CreateIndex
CREATE UNIQUE INDEX "roster_groups_name_key" ON "roster_groups"("name");

-- AddForeignKey
ALTER TABLE "group_members" ADD CONSTRAINT "group_members_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "group_members" ADD CONSTRAINT "group_members_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "roster_groups"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
