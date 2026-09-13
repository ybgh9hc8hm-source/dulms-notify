REVOKE SELECT (password_ciphertext) ON public.dulms_accounts FROM anon, authenticated;
REVOKE SELECT (cookie_data) ON public.dulms_sessions FROM anon, authenticated;