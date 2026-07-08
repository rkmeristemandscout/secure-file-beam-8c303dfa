ALTER TABLE public.shared_links ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
CREATE INDEX IF NOT EXISTS shared_links_deleted_at_idx ON public.shared_links(deleted_at);