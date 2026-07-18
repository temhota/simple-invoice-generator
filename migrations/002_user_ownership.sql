DO $$
DECLARE
  first_user_id UUID;
  records_without_owner BOOLEAN;
BEGIN
  ALTER TABLE profile ADD COLUMN IF NOT EXISTS user_id UUID;
  ALTER TABLE clients ADD COLUMN IF NOT EXISTS user_id UUID;
  ALTER TABLE invoices ADD COLUMN IF NOT EXISTS user_id UUID;

  SELECT EXISTS (
    SELECT 1 FROM profile WHERE user_id IS NULL
    UNION ALL
    SELECT 1 FROM clients WHERE user_id IS NULL
    UNION ALL
    SELECT 1 FROM invoices WHERE user_id IS NULL
  ) INTO records_without_owner;

  IF records_without_owner THEN
    SELECT id INTO first_user_id
    FROM auth.users
    ORDER BY created_at ASC, id ASC
    LIMIT 1;

    IF first_user_id IS NULL THEN
      RAISE EXCEPTION 'Cannot assign existing invoice data because no Supabase user exists';
    END IF;

    UPDATE profile SET user_id = first_user_id WHERE user_id IS NULL;
    UPDATE clients SET user_id = first_user_id WHERE user_id IS NULL;
    UPDATE invoices SET user_id = first_user_id WHERE user_id IS NULL;
  END IF;
END $$;

ALTER TABLE profile ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE clients ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE invoices ALTER COLUMN user_id SET NOT NULL;

ALTER TABLE profile DROP CONSTRAINT IF EXISTS profile_pkey;
ALTER TABLE profile DROP CONSTRAINT IF EXISTS profile_id_check;
ALTER TABLE profile DROP COLUMN IF EXISTS id;
ALTER TABLE profile ADD CONSTRAINT profile_pkey PRIMARY KEY (user_id);

ALTER TABLE profile DROP CONSTRAINT IF EXISTS profile_user_id_fkey;
ALTER TABLE clients DROP CONSTRAINT IF EXISTS clients_user_id_fkey;
ALTER TABLE invoices DROP CONSTRAINT IF EXISTS invoices_user_id_fkey;
ALTER TABLE profile ADD CONSTRAINT profile_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE clients ADD CONSTRAINT clients_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE invoices ADD CONSTRAINT invoices_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE invoices DROP CONSTRAINT IF EXISTS invoices_invoice_number_key;
ALTER TABLE invoices DROP CONSTRAINT IF EXISTS invoices_user_invoice_number_key;
ALTER TABLE invoices ADD CONSTRAINT invoices_user_invoice_number_key
  UNIQUE (user_id, invoice_number);

DROP INDEX IF EXISTS clients_name_idx;
DROP INDEX IF EXISTS invoices_status_idx;
DROP INDEX IF EXISTS invoices_updated_idx;
CREATE INDEX IF NOT EXISTS clients_user_name_idx ON clients (user_id, LOWER(name));
CREATE INDEX IF NOT EXISTS invoices_user_status_idx ON invoices (user_id, status);
CREATE INDEX IF NOT EXISTS invoices_user_updated_idx ON invoices (user_id, updated_at DESC);

ALTER TABLE profile ENABLE ROW LEVEL SECURITY;
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS profile_owner_access ON profile;
DROP POLICY IF EXISTS clients_owner_access ON clients;
DROP POLICY IF EXISTS invoices_owner_access ON invoices;
CREATE POLICY profile_owner_access ON profile
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY clients_owner_access ON clients
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY invoices_owner_access ON invoices
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
