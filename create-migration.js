const fs = require('fs');
const path = require('path');

const migrationDir = 'prisma/migrations/20261030100000_p21_invoice_due_date';
fs.mkdirSync(migrationDir, { recursive: true });

const sql = '-- P2.1: Add dueDate and paymentTerms to Invoice model\nALTER TABLE "Invoice" ADD COLUMN "dueDate" TIMESTAMP(3);\nALTER TABLE "Invoice" ADD COLUMN "paymentTerms" INTEGER;\n\n-- Index for dueDate queries (aging reports)\nCREATE INDEX "Invoice_dueDate_idx" ON "Invoice" ("dueDate");\n';

fs.writeFileSync(path.join(migrationDir, 'migration.sql'), sql);
console.log('Migration created successfully');