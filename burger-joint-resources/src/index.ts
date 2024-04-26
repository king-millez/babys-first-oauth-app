import bodyParser from "body-parser";
import express from "express";
import path from "path";
import { env } from "./lib/env";
import { newAccessCode } from "./lib/graphql/auth-codes";
import { burgerCount, eatBurger } from "./lib/graphql/burger";
import { oauthClientFromQuery } from "./lib/graphql/oauth-clients";
import { getLogger } from "./lib/logger";
import { authoriseQuerySchema, clientQuerySchema } from "./lib/oauth/authorise";
import { addBurgerCountEndpoint } from "./routes/burger-api";
import { addOauthTokenRoute } from "./routes/oauth-token";
import { isLeft } from "./types/either";

const logger = getLogger("express");

const app = express();
const port = 3000;

app.use(
  bodyParser.urlencoded({
    extended: true,
  })
);
app.use(express.static(path.join(path.dirname(__dirname), "public")));

app.set("view engine", "ejs");

app.get("/", async (_, res) => {
  const count = await burgerCount(env.USER_ID);
  res.render("global", { viewName: "./home.ejs", data: { count } });
});

app.get("/eat", async (_, res) => {
  await eatBurger(env.USER_ID, 1);
  res.redirect("/");
});

app.get("/authorise", async (req, res) => {
  const maybeAuthoriseQuery = authoriseQuerySchema.safeParse(req.query);

  if (!maybeAuthoriseQuery.success) {
    res.status(400).send(maybeAuthoriseQuery.error.errors);
    return;
  }

  const authoriseQuery = maybeAuthoriseQuery.data;

  if (authoriseQuery.response_type !== "code") {
    res.status(400).send(
      `Invalid response type [${authoriseQuery.response_type}]. Required [code].` // Yeah I know this is vulnerable to XSS; don't deploy this in a prod environment.
    );
    return;
  }

  const maybeClient = await oauthClientFromQuery(
    authoriseQuery.client_id,
    logger
  );

  if (isLeft(maybeClient)) {
    res.status(404).send(maybeClient.error);
    return;
  }

  res.render("global", {
    viewName: "./authorise.ejs",
    data: {
      clientName: maybeClient.value.name,
      clientId: maybeClient.value.client_id,
      scope: [...authoriseQuery.scope].join(" "),
    },
  });
});

app.get("/access", async (req, res) => {
  const maybeAccessQuery = clientQuerySchema.safeParse(req.query);

  if (!maybeAccessQuery.success) {
    res.status(400).send(maybeAccessQuery.error.errors);
    return;
  }

  const maybeClient = await oauthClientFromQuery(
    maybeAccessQuery.data.client_id,
    logger
  );

  if (isLeft(maybeClient)) {
    res.status(404).send(maybeClient.error);
    return;
  }

  const client = maybeClient.value;

  // Grant a new access code
  const maybeAccessCode = await newAccessCode(
    maybeClient.value.id,
    env.USER_ID,
    maybeAccessQuery.data.scope
  );

  if (isLeft(maybeAccessCode)) {
    res.status(500).send(maybeAccessCode.error);
    return;
  }

  res.redirect(`${client.redirect_uri}?code=${maybeAccessCode.value}`);
});

addOauthTokenRoute(app, logger);

addBurgerCountEndpoint(
  app,
  logger,
  Buffer.from(env.BURGER_AUTH_JWT_PUB_KEY, "base64").toString("ascii")
);

app.listen(port, () => {
  logger.info(`Burger joint app listening on port [${port}].`);
});
