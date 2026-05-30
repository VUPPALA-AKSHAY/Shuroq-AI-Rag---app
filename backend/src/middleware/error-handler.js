import { HttpError } from "../utils/http-error.js";

export function notFoundHandler(_req, _res, next) {
  next(new HttpError(404, "Route not found"));
}

export function errorHandler(err, _req, res, _next) {
  const status = err instanceof HttpError ? err.status : 500;
  const message = err.message || "Internal server error";

  if (status >= 500) {
    console.error("Unhandled server error:", err);
  }

  res.status(status).json({
    ok: false,
    error: message,
    details: err.details || null
  });
}
