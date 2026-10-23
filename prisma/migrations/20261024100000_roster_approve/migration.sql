-- Approving / revoking roster characters is its own capability, so raid leaders can do it without editing the roster.
-- Whoever already edits the roster keeps being able to approve; the seeded Raidleader gets it too.
UPDATE "roles" SET "capabilities" = array_append("capabilities", 'roster.approve')
WHERE ('roster.manage' = ANY("capabilities") OR "name" = 'Raidleader')
  AND NOT ('roster.approve' = ANY("capabilities"));
