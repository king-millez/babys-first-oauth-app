import json
import typing as t
from base64 import b64decode
from datetime import datetime

import requests
from bson.objectid import ObjectId
from flask_social import env
from flask_social.crypto import decrypt, encrypt
from flask_social.mongo import db
from requests.auth import HTTPBasicAuth


def token_payload(raw_token: str) -> dict[str, t.Any]:
    return json.loads(b64decode(raw_token.split(".")[1].encode() + b"==").decode())


def write_token_to_db(
    user_id: str, access_token: str, refresh_token: str, token_key: str
) -> None:
    db["access-tokens"].insert_one(
        {
            "user_id": user_id,
            "access_token": encrypt(access_token, token_key),
            "refresh_token": encrypt(refresh_token, token_key),
        }
    )


def request_token(
    user_id: str,
    client_id: str,
    client_secret: str,
    token_key: str,
    data: dict[str, str],
) -> dict[str, str]:
    token_response = requests.post(
        f"{env['BURGER_RESOURCES_BASE_URL']}/oauth2/token",
        data=data,
        headers={
            "Content-Type": "application/x-www-form-urlencoded",
        },
        auth=HTTPBasicAuth(client_id, client_secret),
    ).json()

    write_token_to_db(
        user_id,
        token_response["access_token"],
        token_response["refresh_token"],
        token_key,
    )

    return token_response


def validate_or_refresh_token(
    access_token: str,
    refresh_token: str,
    user_id: str,
    client_id: str,
    client_secret: str,
    token_key: str,
    existing_token_id: str,
) -> dict[str, str]:
    expires: int = token_payload(access_token)["exp"]

    if int(datetime.now().timestamp()) <= expires:
        return {"access_token": access_token, "refresh_token": refresh_token}

    db["access-tokens"].delete_one({"_id": ObjectId(existing_token_id)})

    return request_token(
        user_id,
        client_id,
        client_secret,
        token_key,
        {"grant_type": "refresh_token", "refresh_token": refresh_token},
    )


def user_access_token(
    user_id: str, token_key: str, client_id: str, client_secret: str
) -> t.Optional[str]:
    token_entry = db["access-tokens"].find_one({"user_id": user_id})

    if not token_entry:
        return None

    return validate_or_refresh_token(
        decrypt(token_entry["access_token"], token_key),
        decrypt(token_entry["refresh_token"], token_key),
        user_id,
        client_id,
        client_secret,
        token_key,
        str(token_entry["_id"]),
    )["access_token"]


def access_token_from_grant(
    grant: str, user_id: str, client_id: str, client_secret: str, token_key: str
) -> str:
    return request_token(
        user_id,
        client_id,
        client_secret,
        token_key,
        {"grant_type": "authorization_code", "code": grant},
    )["access_token"]
