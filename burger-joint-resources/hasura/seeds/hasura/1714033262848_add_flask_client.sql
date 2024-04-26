SET check_function_bodies = false;

INSERT INTO public.clients (client_id, client_secret_hash, name, redirect_uri)
VALUES ('flask_social', crypt('Sup3rSecre7!#@@', gen_salt('bf', 8)), 'Flask Social', 'http://social.local:5000/oauth2/callback');

INSERT INTO public.burgers (user_id, count)
VALUES ('john_doe', 0)
