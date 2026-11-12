-- Data repairs a reviewed schema change needs before it can be applied.
-- Run by `npm run db:apply` BEFORE prisma/pending-change.sql. Idempotent.

-- P2-38 / D16: founder_slots gains a foreign key to users with ON DELETE
-- CASCADE. A slot whose user was deleted before the key existed would make the
-- constraint fail to build; such a slot is released (D16: a deleted Founder's
-- slot goes back to the pool).
DELETE FROM founder_slots fs
WHERE NOT EXISTS (SELECT 1 FROM users u WHERE u.id = fs.user_id);
