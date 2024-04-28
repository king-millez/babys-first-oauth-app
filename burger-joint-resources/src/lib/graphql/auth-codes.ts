import crypto from "crypto";
import { Logger } from "pino";
import { Either, left, right } from "../../types/either";
import { ZeusScalars } from "../generated/zeus";
import { gqlClient } from "./client";

type AuthCodeMetadata = {
  user_id: string;
  used: boolean;
  scope: string[];
  code: string;
};

export const newAccessCode = async (
  clientDbId: string,
  userId: string,
  scope: Set<string>
): Promise<Either<string, string>> => {
  const code = (
    await gqlClient("mutation", { scalars: ZeusScalars({}) })({
      insert_access_codes_one: [
        { object: { client: clientDbId, user_id: userId, scope: [...scope] } },
        { code: true },
      ],
    })
  ).insert_access_codes_one?.code as string | undefined;

  return code !== undefined
    ? right(code)
    : left("Failed to generate access code.");
};

const markUsedAuthCode = async (
  code: string,
  logger: Logger
): Promise<void> => {
  await gqlClient("mutation", { scalars: ZeusScalars({}) })({
    update_access_codes: [
      { where: { code: { _eq: code } }, _set: { used: true } },
      { affected_rows: true },
    ],
  });
  logger.info(`Marked auth code [${code}] as used.`);
};

export const authCodeMetadata = async (
  code: string,
  logger: Logger
): Promise<Either<string, AuthCodeMetadata>> => {
  const authCodeData = (
    await gqlClient("query", { scalars: ZeusScalars({}) })({
      access_codes: [
        { where: { code: { _eq: code } } },
        {
          user_id: true,
          used: true,
          scope: true,
          code: true,
        },
      ],
    })
  ).access_codes[0] as AuthCodeMetadata | undefined;

  if (authCodeData?.used) {
    const tokenRevokeResult = await gqlClient("mutation", {
      scalars: ZeusScalars({}),
    })({
      delete_access_tokens: [
        { where: { access_code: { _eq: code } } },
        { affected_rows: true },
      ],
    });

    logger.info(
      `Revoked [${tokenRevokeResult.delete_access_tokens?.affected_rows}] access tokens.`
    );

    return left("Auth code has already been used.");
  }

  await markUsedAuthCode(code, logger);

  return authCodeData !== undefined
    ? right(authCodeData)
    : left("Invalid auth code.");
};

export const grantDataFromRefreshToken = async (
  refreshToken: string,
  logger: Logger
): Promise<Either<string, AuthCodeMetadata>> => {
  const hashedToken = crypto
    .createHash("sha256")
    .update(refreshToken)
    .digest("hex");

  const maybeToken = (
    await gqlClient("query", { scalars: ZeusScalars({}) })({
      refresh_tokens: [
        { where: { token_hash: { _eq: hashedToken } } },
        {
          access_code: {
            user_id: true,
            used: true,
            scope: true,
          },
          auth_code: true,
        },
      ],
    })
  ).refresh_tokens[0];

  const revokedRefreshTokens = await gqlClient("mutation", {
    scalars: ZeusScalars({}),
  })({
    delete_refresh_tokens: [
      { where: { token_hash: { _eq: hashedToken } } },
      { affected_rows: true },
    ],
  });

  logger.info(
    `Deleted [${revokedRefreshTokens.delete_refresh_tokens?.affected_rows}] refresh tokens.`
  );

  return maybeToken !== undefined
    ? right({
        user_id: maybeToken.access_code.user_id,
        used: maybeToken.access_code.used,
        scope: maybeToken.access_code.scope,
        code: maybeToken.auth_code as string,
      })
    : left("Invalid refresh token.");
};
