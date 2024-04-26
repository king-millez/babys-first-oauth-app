CREATE TABLE public.access_tokens (
    jti text NOT NULL,
    access_code uuid NOT NULL
);
COMMENT ON TABLE public.access_tokens IS 'Minted OAuth 2.0 access tokens. Used to track revocations in the event of an access code replay.';
ALTER TABLE ONLY public.access_tokens
    ADD CONSTRAINT access_tokens_pkey PRIMARY KEY (jti);
ALTER TABLE ONLY public.access_tokens
    ADD CONSTRAINT access_tokens_access_code_fkey FOREIGN KEY (access_code) REFERENCES public.access_codes(code) ON UPDATE RESTRICT ON DELETE RESTRICT;
