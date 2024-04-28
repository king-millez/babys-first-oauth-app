import { z } from "zod";
import { scopeSchema } from "./scope";

export const clientIdPresentSchema = z.object({
  client_id: z.string(),
});

export const clientQuerySchema = clientIdPresentSchema.extend({
  scope: scopeSchema,
});

export const redirectUriPresentSchema = z.object({
  redirect_uri: z.string(),
});

export const authoriseQuerySchema = clientQuerySchema
  .extend({
    response_type: z.literal("code"),
  })
  .merge(redirectUriPresentSchema);
