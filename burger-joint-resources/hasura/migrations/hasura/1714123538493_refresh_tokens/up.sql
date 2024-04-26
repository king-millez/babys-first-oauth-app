CREATE TABLE public.refresh_tokens (
    token_hash text NOT NULL,
    auth_code uuid NOT NULL
);
COMMENT ON TABLE public.refresh_tokens IS 'OAuth 2.0 refresh tokens associated with auth codes.';
ALTER TABLE ONLY public.refresh_tokens
    ADD CONSTRAINT refresh_tokens_pkey PRIMARY KEY (token_hash);
ALTER TABLE ONLY public.refresh_tokens
    ADD CONSTRAINT refresh_tokens_auth_code_fkey FOREIGN KEY (auth_code) REFERENCES public.access_codes(code) ON UPDATE RESTRICT ON DELETE RESTRICT;
