# Baby's first OAuth 2.0 App

Don't run this in production like a moron.

## Background

There are lots of videos "explaining" how OAuth 2.0 works, and they're not very good. This app seeks to demonstrate OAuth 2.0 in a practical way while following [the spec](https://datatracker.ietf.org/doc/html/rfc6749).

## Setup

You will need:

- [direnv](https://direnv.net/)
- [Hasura](https://hasura.io/) CLI
- [Docker](https://www.docker.com/)
- [Python 3](https://www.python.org/downloads/)

---

1. Edit your hosts file (probably `/etc/hosts`) to include `localhost` routes for `burger.local` and `social.local`:

   ```
   127.0.0.1 localhost burger.local social.local
   ```

2. Run the `generate_envrc.py` to set all the required environment variables. **This won't work without `direnv`**.

3. On the first run, just use the `start_local.py` script to spin up the local environment and retrieve the required environment variables:

   ```sh
   $ python3 start_local.py
   ```

   This will launch the authoriser and resource server @ http://burger.local:3000 and the client @ http://social.local:5000.

Note that this has not been designed to be deployed anywhere beyond your local machine for testing and learning purposes. Do not use any of this code in production. Do not deploy this anywhere else. Do not email me complaining that things don't work. You have been warned.

## What's implemented

* `/authorise` supports the authorization code grant flow.
* `/token` supports completion of the authorization code grant flow and token exchange of a refresh token for a new access token. In both cases, the supported security mechanism is client id and secret and is suitable for use by confidential clients only.

## Usage

When you visit `burger.local`, you'll be able to update your burger count for bragging rights. This is pretty cool, but perhaps you want to display this value on another service? Thankfully, `social.local` has registered an OAuth 2.0 client with `burger.local`.

To link your `burger.local` profile with your `social.local` profile, simply go to `social.local/burgers` and click "Link now!". Authorise the OAuth 2.0 access request and your burger count should magically appear on your `social.local` profile using the power of OAuth.
