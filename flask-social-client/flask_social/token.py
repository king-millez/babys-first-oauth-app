import typing as t

import requests
from flask_social import env
from flask_social.crypto import decrypt, encrypt
from flask_social.mongo import db


def validate_or_refresh_token(access_token: str, refresh_token: str) -> tuple[str, str]:
    # Check if the access token has expired. If it hasn't, return it.
    # If it has, use the refresh token to get a new access token.
    return access_token, refresh_token


def user_access_token(user_id: str, token_key: str) -> t.Optional[str]:
    token_entry = db["access-tokens"].find_one({"user_id": user_id})

    if not token_entry:
        return None

    (access_token, refresh_token) = decrypt(
        token_entry["access_token"], token_key
    ), decrypt(token_entry["refresh_token"], token_key)

    return access_token


def access_token_from_grant(
    grant: str, user_id: str, client_id: str, client_secret: str, token_key: str
) -> str:
    # Get access token
    token_response = requests.post(
        f"{env['BURGER_RESOURCES_BASE_URL']}/oauth2/token",
        data={
            "grant_type": "authorization_code",
            "client_id": client_id,
            "client_secret": client_secret,
            "code": grant,
        },
        headers={
            "Content-Type": "application/x-www-form-urlencoded",
        },
    ).json()

    db["access-tokens"].insert_one(
        {
            "user_id": user_id,
            "access_token": encrypt(token_response["access_token"], token_key),
            "refresh_token": encrypt(token_response["refresh_token"], token_key),
        }
    )

    return token_response["access_token"]
