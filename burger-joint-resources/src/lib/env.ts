import { cleanEnv, str } from "envalid";

export const env = cleanEnv(process.env, {
  GRAPHQL_URI: str(),
  GRAPHQL_ADMIN_SECRET: str(),
  USER_ID: str(), // Demo purposes only. Obviously you should write your own user auth.,
  BURGER_RESOURCES_BASE_URL: str(),
  JWT_SECRET: str(),
  BURGER_AUTH_JWT_PUB_KEY: str(),
  BURGER_AUTH_JWT_PRIVATE_KEY: str(),
});
