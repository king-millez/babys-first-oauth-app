import { Logger } from "pino";
import { Either, left, right } from "../../types/either";
import { ZeusScalars } from "../generated/zeus";
import { gqlClient } from "./client";

export type OAuthClient = Readonly<{
  id: string;
  name: string;
  client_id: string;
  client_secret_hash: string;
  redirect_uri: string;
}>;

export const allOauthClients = async () =>
  gqlClient("query", { scalars: ZeusScalars({}) })({
    clients: [
      {},
      { id: true, name: true, client_id: true, client_secret_hash: true },
    ],
  });

export const oauthClientById = async (
  clientId: string,
  logger: Logger
): Promise<Either<string, OAuthClient>> => {
  logger.info(`Fetching client with id [${clientId}]...`);
  const oauthClient = (
    await gqlClient("query", { scalars: ZeusScalars({}) })({
      clients: [
        { where: { client_id: { _eq: clientId } } },
        {
          client_secret_hash: true,
          name: true,
          client_id: true,
          id: true,
          redirect_uri: true,
        },
      ],
    })
  ).clients[0] as OAuthClient | undefined; // UUID is a string.

  if (oauthClient === undefined) {
    const message = `Client with ID [${clientId}] not found.`;
    logger.warn(message);
    return left(message);
  }

  logger.debug(`Found client [${oauthClient.name}].`);
  return right(oauthClient);
};
