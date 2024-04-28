import crypto from "crypto";
import jwt, { JwtPayload } from "jsonwebtoken";
import { Logger } from "pino";
import { Either, left, right } from "../types/either";
import { env } from "./env";
import { ZeusScalars } from "./generated/zeus";
import { gqlClient } from "./graphql/client";

export const mintAccessToken = async (
  userId: string,
  clientId: string,
  scopes: string[],
  grant: string
): Promise<{
  accessToken: string;
  refreshToken: string;
  exp: number;
  iat: number;
}> => {
  const jti = Math.random().toString(36).substring(7);

  const now = Math.floor(Date.now() / 1000);

  const exp = now + 60 * 60;

  const accessToken = jwt.sign(
    {
      iss: env.BURGER_RESOURCES_BASE_URL,
      sub: userId,
      exp,
      aud: env.BURGER_RESOURCES_BASE_URL, // Resource server is the auth server for this implementation.
      client_id: clientId,
      iat: now,
      scope: scopes.join(" "),
      jti,
    },
    {
      key: Buffer.from(env.BURGER_AUTH_JWT_PRIVATE_KEY, "base64")
        .toString("ascii")
        .replace(/\\n/gm, "\n"),
      passphrase: env.JWT_SECRET,
    },
    { header: { alg: "RS256", typ: "at+JWT" }, algorithm: "RS256" }
  );

  const refreshToken = Buffer.from(crypto.randomUUID()).toString("base64");

  await gqlClient("mutation", { scalars: ZeusScalars({}) })({
    insert_access_tokens_one: [
      {
        object: {
          jti,
          access_code: grant,
        },
      },
      { access_code: true },
    ],
    insert_refresh_tokens_one: [
      {
        object: {
          token_hash: crypto
            .createHash("sha256")
            .update(refreshToken)
            .digest("hex"),
          auth_code: grant,
        },
      },
      { auth_code: true },
    ],
  });

  return { accessToken, refreshToken, exp, iat: now };
};

export const verifyAccessToken = (
  token: string,
  publicKey: string,
  logger: Logger
): Either<string, JwtPayload> => {
  const failure = left("Could not verify JWT.");
  try {
    const result = jwt.verify(token, publicKey, { algorithms: ["RS256"] });
    return result instanceof Object ? right(result) : failure;
  } catch (e: unknown) {
    logger.error(e);
    return failure;
  }
};
