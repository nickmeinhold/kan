import type { NextApiRequest, NextApiResponse } from "next";
import cors from "nextjs-cors";
import { createOpenApiNextHandler } from "trpc-to-openapi";

import { appRouter } from "@kan/api";
import { createRESTContext } from "@kan/api/trpc";

import { env } from "~/env";
import { withRateLimit } from "@kan/api/utils/rateLimit";

export default withRateLimit(
  { points: 100, duration: 60 },
  async (req: NextApiRequest, res: NextApiResponse) => {
    await cors(req, res);

    const openApiHandler = createOpenApiNextHandler({
      router: appRouter,
      createContext: createRESTContext,
      onError: ({ path, error }) => {
        console.error(
          `REST failed on ${path ?? "<no-path>"}: ${error.message}`,
        );
        if (env.NODE_ENV === "development") {
          console.error(error);
        }
      },
    });

    return await openApiHandler(req, res);
  },
);
