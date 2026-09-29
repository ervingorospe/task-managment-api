-- CreateIndex
CREATE INDEX "activity_log_entries_involvedUserIds_idx" ON "activity_log_entries" USING GIN ("involvedUserIds");

