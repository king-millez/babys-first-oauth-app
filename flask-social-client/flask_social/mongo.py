from flask_social import env
from pymongo import MongoClient

_client = MongoClient(env["MONGO_URI"])
db = _client["client-social"]
