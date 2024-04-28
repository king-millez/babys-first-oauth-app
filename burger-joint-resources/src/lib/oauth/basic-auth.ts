export const headerValue = (
  header: string | string[] | undefined
): string | undefined => [header].flatMap((h) => h)[0];

export const credsFromBasicAuth = (
  auth: string
): { clientId: string; clientSecret: string } | undefined => {
  const [clientId, clientSecret] = Buffer.from(
    auth.split(" ").at(-1) ?? "",
    "base64"
  )
    .toString()
    .split(":");

  return clientId !== undefined && clientSecret !== undefined
    ? { clientId, clientSecret }
    : undefined;
};
