import { env } from "../env";
import { Chain } from "../generated/zeus";

export const gqlClient = Chain(env.GRAPHQL_URI, {
  headers: { "x-hasura-admin-secret": env.GRAPHQL_ADMIN_SECRET },
});
