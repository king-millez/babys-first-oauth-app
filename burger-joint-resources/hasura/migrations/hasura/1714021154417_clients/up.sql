CREATE EXTENSION IF NOT EXISTS pgcrypto;

SET check_function_bodies = false;
CREATE TABLE public.clients (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    client_id text NOT NULL,
    client_secret_hash text NOT NULL,
    name TEXT NOT NULL,
    redirect_uri TEXT NOT NULL
);
COMMENT ON TABLE public.clients IS 'Registered OAuth 2.0 clients.';

ALTER TABLE ONLY public.clients
    ADD CONSTRAINT clients_client_id_key UNIQUE (client_id);
ALTER TABLE ONLY public.clients
    ADD CONSTRAINT clients_pkey PRIMARY KEY (id);
