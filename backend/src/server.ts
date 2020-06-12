"use strict";

import * as http from "http";
import * as https from "https";

import * as appRoot from "app-root-path";
import * as express from "express";
import { Request } from "express";
import * as ws from "express-ws";

import * as api from "./api";
import { langs } from "./langs";

const host = process.env.HOST || "localhost";
const port = parseInt(process.env.PORT) || 6119;
const tlsPort = parseInt(process.env.TLS_PORT) || 6120;
const useTLS = process.env.TLS ? true : false;

const app = express();

app.set("query parser", (qs: string) => new URLSearchParams(qs));
app.set("view engine", "ejs");

function getQueryParams(req: Request): URLSearchParams {
  // This is safe because we set the query parser for Express to
  // return URLSearchParams objects.
  return (req.query as unknown) as URLSearchParams;
}

app.get("/", (_, res) => {
  res.render(appRoot.path + "/frontend/pages/index", { langs });
});
app.get("/:lang", (req, res) => {
  if (langs[req.params.lang]) {
    res.render(appRoot.path + "/frontend/pages/app", {
      config: { id: req.params.lang, ...langs[req.params.lang] },
    });
  } else {
    res.send(`No such language: ${req.params.lang}`);
  }
});
app.use("/css", express.static(appRoot.path + "/frontend/styles"));
app.use("/js", express.static(appRoot.path + "/frontend/out"));

function addWebsocket(baseApp: express.Express, httpsServer: https.Server) {
  const app = ws(baseApp, httpsServer).app;
  app.ws("/api/v1/ws", (ws, req) => {
    const lang = getQueryParams(req).get("lang");
    if (!lang) {
      ws.send(
        JSON.stringify({
          event: "error",
          errorMessage: "No language specified",
        })
      );
      ws.close();
    } else if (!langs[lang]) {
      ws.send(
        JSON.stringify({
          event: "error",
          errorMessage: `No such language: ${lang}`,
        })
      );
      ws.close();
    } else {
      new api.Session(ws, getQueryParams(req).get("lang"));
    }
  });
  return app;
}

if (useTLS) {
  const httpsServer = https.createServer(
    {
      key: Buffer.from(process.env.TLS_PRIVATE_KEY, "base64").toString("ascii"),
      cert: Buffer.from(process.env.TLS_CERTIFICATE, "base64").toString(
        "ascii"
      ),
    },
    app
  );
  addWebsocket(app, httpsServer);
  httpsServer.listen(tlsPort, host, () =>
    console.log(`Listening on https://${host}:${tlsPort}`)
  );
  http
    .createServer((req, res) => {
      res.writeHead(301, {
        Location: "https://" + req.headers["host"] + req.url,
      });
      res.end();
    })
    .listen(port, host, () =>
      console.log(`Listening on http://${host}:${port}`)
    );
} else {
  addWebsocket(app, undefined);
  app.listen(port, host, () =>
    console.log(`Listening on http://${host}:${port}`)
  );
}
