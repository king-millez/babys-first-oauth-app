import { Express } from "express";
import { Logger } from "pino";
import {
  authCodeMetadata,
  grantDataFromRefreshToken,
} from "../lib/graphql/auth-codes";
import { mintAccessToken } from "../lib/jwt";
import { credsFromBasicAuth, headerValue } from "../lib/oauth/basic-auth";
import { authCodeQuerySchema, authenticateClient } from "../lib/oauth/client";
import { isLeft } from "../types/either";

export const addOauthTokenRoute = (app: Express, logger: Logger) => {
  app.post("/oauth2/token", async (req, res) => {
    const maybeClientAuth = authCodeQuerySchema.safeParse(req.body);

    if (!maybeClientAuth.success) {
      logger.warn(maybeClientAuth.error.errors);
      res.status(400).send(maybeClientAuth.error.errors); // This might lead to client secret exposure, so again, don't use this in production.
      return;
    }

    const clientAuthRequest = maybeClientAuth.data;

    const rawHeaderAuth = headerValue(
      req.headers.authorization ?? req.headers.Authorization
    );

    const authCredentials =
      rawHeaderAuth !== undefined
        ? credsFromBasicAuth(rawHeaderAuth)
        : clientAuthRequest.client_id !== undefined
          ? {
              clientId: clientAuthRequest.client_id,
              clientSecret: clientAuthRequest.client_secret,
            }
          : undefined;

    if (authCredentials === undefined) {
      res.status(401).send("Invalid client credentials.");
      return;
    }

    logger.info(
      `Received [${clientAuthRequest.grant_type}] request from [${authCredentials.clientId}].`
    );

    const validAuth = await authenticateClient(authCredentials, logger);

    logger.debug({ validAuth, clientId: authCredentials.clientId });

    if (!validAuth) {
      res.status(401).send("Invalid client credentials.");
      return;
    }

    const maybeGrantData =
      clientAuthRequest.grant_type === "authorization_code"
        ? await authCodeMetadata(clientAuthRequest.code, logger)
        : await grantDataFromRefreshToken(
            clientAuthRequest.refresh_token,
            logger
          );

    if (isLeft(maybeGrantData)) {
      logger.warn(maybeGrantData.error);
      res.status(401).send(maybeGrantData.error);
      return;
    }

    const grantData = maybeGrantData.value;

    const { accessToken, refreshToken, exp, iat } = await mintAccessToken(
      grantData.user_id,
      authCredentials.clientId,
      grantData.scope,
      grantData.code
    );

    logger.info({ accessToken });

    res.json({
      access_token: accessToken,
      refresh_token: refreshToken,
      token_type: "bearer",
      expires_in: exp - iat,
    });
  });
};
