import { env } from "../env";
import { Chain } from "../generated/zeus";

export const client = Chain(env.GRAPHQL_URI, {
  headers: { "x-hasura-admin-secret": env.GRAPHQL_ADMIN_SECRET },
});
