import { z } from "zod";

export const allowedScopes = ["burger_count"];

export const scopeSchema = z
  .string()
  .transform((s) => new Set(s.split(" ")))
  .refine(
    (scopes) => [...scopes].every((scope) => allowedScopes.includes(scope)),
    {
      message: `Invalid scope(s). Allowed scopes are: [${JSON.stringify(allowedScopes)}].`,
    }
  );
