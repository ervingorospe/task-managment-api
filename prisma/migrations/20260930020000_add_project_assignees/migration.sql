-- CreateTable
CREATE TABLE "_ProjectAssignees" (
    "A" INTEGER NOT NULL,
    "B" INTEGER NOT NULL,
    CONSTRAINT "_ProjectAssignees_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE INDEX "_ProjectAssignees_B_index" ON "_ProjectAssignees"("B");

-- AddForeignKey
ALTER TABLE "_ProjectAssignees" ADD CONSTRAINT "_ProjectAssignees_A_fkey" FOREIGN KEY ("A") REFERENCES "members"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_ProjectAssignees" ADD CONSTRAINT "_ProjectAssignees_B_fkey" FOREIGN KEY ("B") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
