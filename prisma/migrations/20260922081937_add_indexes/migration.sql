-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- CreateIndex
CREATE INDEX "member_invites_orgId_isDeleted_idx" ON "member_invites"("orgId", "isDeleted");

-- CreateIndex
CREATE INDEX "members_orgId_isDeleted_idx" ON "members"("orgId", "isDeleted");

-- CreateIndex
CREATE INDEX "members_userId_idx" ON "members"("userId");

-- CreateIndex
CREATE INDEX "organizations_ownerId_isDeleted_idx" ON "organizations"("ownerId", "isDeleted");

-- CreateIndex
CREATE INDEX "request_attachments_requestId_idx" ON "request_attachments"("requestId");

-- CreateIndex
CREATE INDEX "roles_orgId_isDeleted_idx" ON "roles"("orgId", "isDeleted");

-- CreateIndex
CREATE INDEX "tags_orgId_isDeleted_idx" ON "tags"("orgId", "isDeleted");

-- CreateIndex
CREATE INDEX "ticket_attachments_ticketId_idx" ON "ticket_attachments"("ticketId");

-- CreateIndex
CREATE INDEX "ticket_comments_ticketId_isDeleted_idx" ON "ticket_comments"("ticketId", "isDeleted");

-- CreateIndex
CREATE INDEX "ticket_requests_orgId_isDeleted_createdAt_idx" ON "ticket_requests"("orgId", "isDeleted", "createdAt");

-- CreateIndex
CREATE INDEX "ticket_requests_orgId_status_idx" ON "ticket_requests"("orgId", "status");

-- CreateIndex
CREATE INDEX "ticket_requests_clientId_idx" ON "ticket_requests"("clientId");

-- CreateIndex
CREATE INDEX "tickets_orgId_isDeleted_createdAt_idx" ON "tickets"("orgId", "isDeleted", "createdAt");

-- CreateIndex
CREATE INDEX "tickets_orgId_tagId_idx" ON "tickets"("orgId", "tagId");

-- CreateIndex
CREATE INDEX "tickets_orgId_dueDate_idx" ON "tickets"("orgId", "dueDate");

-- CreateIndex
CREATE INDEX "tickets_orgId_starred_idx" ON "tickets"("orgId", "starred");

-- CreateIndex
CREATE INDEX "tickets_clientId_idx" ON "tickets"("clientId");

-- CreateIndex
CREATE INDEX "tickets_title_idx" ON "tickets" USING GIN ("title" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "tickets_referenceId_idx" ON "tickets" USING GIN ("referenceId" gin_trgm_ops);
