import { Logger } from "pino";
import { Either, left, right } from "../../types/either";
import { ZeusScalars } from "../generated/zeus";
import { client } from "./client";

export type Client = Readonly<{
  id: string;
  name: string;
  client_id: string;
  client_secret_hash: string;
  redirect_uri: string;
}>;

export const allOauthClients = async () =>
  client("query", { scalars: ZeusScalars({}) })({
    clients: [
      {},
      { id: true, name: true, client_id: true, client_secret_hash: true },
    ],
  });

export const oauthClientById = async (
  clientId: string,
  logger: Logger
): Promise<Client | undefined> =>
  (logger.info(`Fetching client with id [${clientId}]...`),
  await client("query", { scalars: ZeusScalars({}) })({
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
  })).clients[0] as Client | undefined; // UUID is a string.

export const oauthClientFromQuery = async (
  clientId: string,
  logger: Logger
): Promise<Either<string, Client>> => {
  const client = await oauthClientById(clientId, logger);

  if (client === undefined) {
    return left(`Client with ID [${clientId}] not found.`);
  }

  logger.debug(`Found client [${client.name}].`);

  return right(client);
};
