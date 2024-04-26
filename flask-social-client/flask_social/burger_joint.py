import requests
from flask_social import env


def burger_count_for_user(access_token: str, user_id: str) -> int:
    return requests.get(f'{env["BURGER_RESOURCES_BASE_URL"]}/api/burger-count/{user_id}', headers={'Authorization': f'Bearer {access_token}'}).json()['count']
