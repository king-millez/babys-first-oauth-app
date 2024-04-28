from evarify import ConfigStore, EnvironmentVariable

env = ConfigStore(
    {
        "USER_ID": EnvironmentVariable("USER_ID"),
        "TOKEN_AES_KEY": EnvironmentVariable("TOKEN_AES_KEY"),
        "CLIENT_ID": EnvironmentVariable("CLIENT_ID"),
        "CLIENT_SECRET": EnvironmentVariable("CLIENT_SECRET"),
        "MONGO_URI": EnvironmentVariable("MONGO_URI"),
        "BURGER_RESOURCES_BASE_URL": EnvironmentVariable("BURGER_RESOURCES_BASE_URL"),
        "SOCIAL_CLIENT_BASE_URL": EnvironmentVariable("SOCIAL_CLIENT_BASE_URL"),
        "OAUTH_CALLBACK": EnvironmentVariable("OAUTH_CALLBACK"),
    }
)
env.load_values()
