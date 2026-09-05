import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { UnauthorizedError } from "./auth";

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

/** Wrap a route handler so thrown errors become JSON responses. */
export function handle<Ctx>(
  fn: (req: Request, ctx: Ctx) => Promise<Response>,
): (req: Request, ctx: Ctx) => Promise<Response> {
  return async (req, ctx) => {
    try {
      return await fn(req, ctx);
    } catch (err) {
      if (err instanceof UnauthorizedError) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
      if (err instanceof HttpError) {
        return NextResponse.json({ error: err.message }, { status: err.status });
      }
      if (err instanceof ZodError) {
        return NextResponse.json({ error: "Invalid request", issues: err.issues }, { status: 400 });
      }
      console.error(err);
      return NextResponse.json({ error: "Internal error" }, { status: 500 });
    }
  };
}
