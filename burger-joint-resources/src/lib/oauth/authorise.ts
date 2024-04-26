import { z } from "zod";
import { scopeSchema } from "./scope";

export const clientQuerySchema = z.object({
  client_id: z.string(),
  scope: scopeSchema,
});

export const authoriseQuerySchema = clientQuerySchema.extend({
  response_type: z.literal("code"),
});
