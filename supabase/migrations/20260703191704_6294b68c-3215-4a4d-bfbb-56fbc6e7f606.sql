
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.set_updated_at() FROM public;

DROP POLICY IF EXISTS "Contact: anyone insert" ON public.contact_messages;
CREATE POLICY "Contact: anon insert" ON public.contact_messages FOR INSERT TO anon
  WITH CHECK (user_id IS NULL AND length(name) BETWEEN 1 AND 100 AND length(email) BETWEEN 3 AND 255 AND length(subject) BETWEEN 1 AND 200 AND length(message) BETWEEN 1 AND 5000);
CREATE POLICY "Contact: auth insert" ON public.contact_messages FOR INSERT TO authenticated
  WITH CHECK ((user_id IS NULL OR user_id = auth.uid()) AND length(name) BETWEEN 1 AND 100 AND length(email) BETWEEN 3 AND 255 AND length(subject) BETWEEN 1 AND 200 AND length(message) BETWEEN 1 AND 5000);
