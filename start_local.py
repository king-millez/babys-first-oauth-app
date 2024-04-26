import os
import platform
import subprocess
import sys
from time import sleep

import requests

BURGER_GRAPHQL_HOSTNAME = "burger.local"


def hasura_is_available() -> bool:
    try:
        return (
            requests.get(f"http://{BURGER_GRAPHQL_HOSTNAME}:8080/healthz").status_code
            == 200
        )
    except Exception:
        return False


hosts_file = (
    "C:/Windows/System32/drivers/etc/hosts"
    if platform.system() == "Windows"
    else "/etc/hosts"
)

with open(hosts_file, "r") as hosts:
    hosts_content = hosts.read()

missing = [
    hostname
    for hostname in [BURGER_GRAPHQL_HOSTNAME, "social.local"]
    if hostname not in hosts_content
]

if missing:
    sys.exit(
        f"Missing hostnames: [{', '.join(missing)}]. Please add these to [{hosts_file}] before continuing."
    )

subprocess.run(["docker", "compose", "up", "-d", "--build"])

attempt = 1
while not hasura_is_available():
    print(f"Waiting for Hasura to be available; attempt [{attempt}]...")
    sleep(10)
    attempt += 1
del attempt
print("Hasura is up.")

os.chdir(os.path.join(os.path.dirname(__file__), "burger-joint-resources", "hasura"))

subprocess.run(
    [
        "hasura",
        "seed",
        "apply",
        "--database-name",
        "hasura",
        "--admin-secret",
        os.getenv("GRAPHQL_ADMIN_SECRET"),  # type: ignore
    ]
)
