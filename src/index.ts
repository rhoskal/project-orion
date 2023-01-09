import axios from "axios";
import * as E from "fp-ts/Either";
import * as IO from "fp-ts/IO";
import * as TE from "fp-ts/TaskEither";
import * as RTE from "fp-ts/ReaderTaskEither";
import { pipe } from "fp-ts/function";
import { match } from "ts-pattern";

import * as Api from "./api";
import { HttpClient, AppEnv, HttpRequest } from "./httpClient";
import { mkHttpRequestError } from "./httpError";

const httpClient: HttpClient = {
  sendRequest: (req: HttpRequest) => {
    return TE.tryCatch(
      () =>
        axios({
          method: req.method,
          url: `https://${process.env.FLATFILE_API_HOST}/${req.endpoint}`,
          data: req.method === "POST" ? req.body : undefined,
          headers: req.headers,
        }),
      (reason) => mkHttpRequestError(reason),
    );
  },
};

const prettyPrint = <A>(preamble: string, data: A) => {
  return IO.of(console.log(preamble, JSON.stringify(data, null, 2)));
};

const main = async () => {
  try {
    if (process.env.FLATFILE_CLIENT_ID === "" || process.env.FLATFILE_SECRET === "") {
      throw "Ensure both FLATFILE_CLIENT_ID and FLATFILE_SECRET env vars are set";
    }

    const appEnv: AppEnv = {
      httpClient,
      accessToken: "",
    };

    const tokenPromise = Api.createToken({
      clientId: process.env.FLATFILE_CLIENT_ID ?? "",
      secret: process.env.FLATFILE_SECRET ?? "",
    })(appEnv);
    const token = await tokenPromise();

    pipe(
      token,
      E.match(
        () => {
          throw "Failed to authenticate.";
        },
        async (accessToken) => {
          const pipelinePromise = pipe(
            // Api.listUsers(),
            // RTE.chainIOK((users) => prettyPrint("\nUsers:", users)),
            // RTE.chain(() => Api.listEnvironments()),
            // RTE.chainIOK((envs) => prettyPrint("\nEnvironments:", envs)),
            // RTE.chain(() => Api.listSpaces()),
            // RTE.chainIOK((spaces) => prettyPrint("\nSpaces:", spaces)),
            Api.listWorkbooks({ spaceId: "dev_sp_dPDmdbu2" }),
            RTE.chainIOK((workbooks) => prettyPrint("\nWorkbooks: ", workbooks)),
            RTE.mapLeft((err) => {
              match(err)
                .with({ _tag: "httpRequestError" }, (error) => console.error(error))
                .with({ _tag: "httpContentTypeError" }, (error) => console.error(error))
                .with({ _tag: "httpResponseStatusError" }, (error) =>
                  console.error(
                    `Encountered status ${error.status} when expecting ${error.minStatusInclusive} <= status < ${error.maxStatusExclusive}`,
                  ),
                )
                .with({ _tag: "httpDecodeError" }, ({ errors }) =>
                  console.error(`Failed to decode because: ${errors}`),
                )
                .exhaustive();
            }),
          )({ ...appEnv, accessToken });

          await pipelinePromise();
        },
      ),
    );
  } catch (err) {
    console.error(`Error: ${err}!`);
  }
};

main();
