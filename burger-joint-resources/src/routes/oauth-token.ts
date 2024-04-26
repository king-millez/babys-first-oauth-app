import { Express } from "express";
import { Logger } from "pino";
import {
  authCodeMetadata,
  grantDataFromRefreshToken,
} from "../lib/graphql/auth-codes";
import { mintAccessToken } from "../lib/jwt";
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

    logger.info(
      `Received a [${clientAuthRequest.grant_type}] request from [${clientAuthRequest.client_id}].`
    );

    const validAuth = await authenticateClient(
      clientAuthRequest.client_id,
      clientAuthRequest.client_secret,
      logger
    );

    logger.debug({ validAuth, clientId: clientAuthRequest.client_id });

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
      clientAuthRequest.client_id,
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
