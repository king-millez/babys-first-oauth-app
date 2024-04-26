import { Express } from "express";
import { Logger } from "pino";
import { burgerCount } from "../lib/graphql/burger";
import { verifyAccessToken } from "../lib/jwt";
import { isLeft } from "../types/either";

export const addBurgerCountEndpoint = (
  app: Express,
  logger: Logger,
  publicKey: string
) => {
  app.get("/api/burger-count/:userId", async (req, res): Promise<void> => {
    const userId = req.params.userId;

    const maybeBearerToken =
      req.headers.authorization ?? req.headers.Authorization;

    if (maybeBearerToken === undefined) {
      res.status(401).send("No token provided.");
      return;
    }

    const bearerToken = [maybeBearerToken].flatMap((h) => h)[0].split(" ")[1];

    logger.info(`Received a request with token [${bearerToken}].`);

    const payload = verifyAccessToken(bearerToken, publicKey, logger);

    logger.info({ payload });

    if (
      isLeft(payload) ||
      payload.value.sub !== userId ||
      !(payload.value.scope as string | undefined)
        ?.split(" ")
        .includes("burger_count")
    ) {
      res.status(401).send("Invalid token.");
      return;
    }

    logger.info(`Token verified for user [${payload.value.sub}].`);

    const count = await burgerCount(userId);

    res.send({ count });
  });
};
