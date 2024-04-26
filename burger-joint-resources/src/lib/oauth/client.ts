import bcrypt from "bcryptjs";
import { Logger } from "pino";
import { z } from "zod";
import { isLeft } from "../../types/either";
import { oauthClientFromQuery } from "../graphql/oauth-clients";

export const authCodeQuerySchema = z.intersection(
  z.object({
    client_id: z.string(),
    client_secret: z.string(),
  }),
  z.union([
    z.object({ grant_type: z.literal("authorization_code"), code: z.string() }),
    z.object({
      grant_type: z.literal("refresh_token"),
      refresh_token: z.string(),
    }),
  ])
);

export const authenticateClient = async (
  clientId: string,
  clientSecret: string,
  logger: Logger
): Promise<boolean> => {
  const maybeClient = await oauthClientFromQuery(clientId, logger);

  if (isLeft(maybeClient)) {
    return false;
  }

  const { client_secret_hash: clientHash } = maybeClient.value;
  return bcrypt.compareSync(clientSecret, clientHash);
};
