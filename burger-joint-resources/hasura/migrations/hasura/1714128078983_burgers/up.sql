CREATE TABLE public.burgers (
    user_id text NOT NULL,
    count integer DEFAULT 0 NOT NULL
);
COMMENT ON TABLE public.burgers IS 'Burger counts for users.';
ALTER TABLE ONLY public.burgers
    ADD CONSTRAINT burgers_pkey PRIMARY KEY (user_id);
