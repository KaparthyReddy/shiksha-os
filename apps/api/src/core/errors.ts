export class AppError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export const unauthorized = (msg = "Authentication required") => new AppError(401, "unauthorized", msg);
export const forbidden = (msg = "You do not have access to this resource") => new AppError(403, "forbidden", msg);
export const notFound = (msg = "Not found") => new AppError(404, "not_found", msg);
export const badRequest = (msg: string) => new AppError(400, "bad_request", msg);
