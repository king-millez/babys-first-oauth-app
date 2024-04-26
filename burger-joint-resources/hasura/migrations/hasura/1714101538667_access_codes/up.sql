SET check_function_bodies = false;
CREATE TABLE public.access_codes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    client uuid NOT NULL,
    code uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id text NOT NULL,
    used boolean DEFAULT false NOT NULL,
    scope text[] NOT NULL
);
COMMENT ON TABLE public.access_codes IS 'OAuth 2.0 access code grants.';
ALTER TABLE ONLY public.access_codes
    ADD CONSTRAINT access_codes_code_key UNIQUE (code);
ALTER TABLE ONLY public.access_codes
    ADD CONSTRAINT access_codes_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.access_codes
    ADD CONSTRAINT access_codes_client_fkey FOREIGN KEY (client) REFERENCES public.clients(id) ON UPDATE RESTRICT ON DELETE RESTRICT;
