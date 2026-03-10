-- AlterTable
ALTER TABLE "activities" ADD COLUMN     "google_event_id" TEXT,
ADD COLUMN     "google_meet_link" TEXT,
ADD COLUMN     "nature" TEXT NOT NULL DEFAULT 'registro',
ADD COLUMN     "priority" TEXT,
ADD COLUMN     "reminder_at" TIMESTAMP(3),
ADD COLUMN     "reminder_email" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "reminder_sent" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "reminder_whatsapp" BOOLEAN NOT NULL DEFAULT false,
ALTER COLUMN "company_id" DROP NOT NULL;

-- CreateTable
CREATE TABLE "activity_attachments" (
    "id" TEXT NOT NULL,
    "activity_id" TEXT NOT NULL,
    "file_url" TEXT NOT NULL,
    "file_name" TEXT NOT NULL,
    "file_type" TEXT NOT NULL,
    "file_size" INTEGER,
    "uploaded_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "activity_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "activity_mentions" (
    "id" TEXT NOT NULL,
    "activity_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,

    CONSTRAINT "activity_mentions_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "activity_attachments" ADD CONSTRAINT "activity_attachments_activity_id_fkey" FOREIGN KEY ("activity_id") REFERENCES "activities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activity_mentions" ADD CONSTRAINT "activity_mentions_activity_id_fkey" FOREIGN KEY ("activity_id") REFERENCES "activities"("id") ON DELETE CASCADE ON UPDATE CASCADE;
