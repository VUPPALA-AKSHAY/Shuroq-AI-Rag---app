import { verifyAccessToken } from "../utils/jwt.js";
import { HttpError } from "../utils/http-error.js";
import { getUserById } from "../services/store.js";

export async function requireAuth(req, _res, next) {
  try {
    const authHeader = req.headers.authorization || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";

    if (!token) {
      throw new HttpError(401, "Missing bearer token");
    }

    const payload = verifyAccessToken(token);
    const user = await getUserById(payload.sub);

    if (!user) {
      throw new HttpError(401, "Invalid token user");
    }

    req.user = user;
    next();
  } catch (error) {
    if (error instanceof HttpError) return next(error);
    return next(new HttpError(401, "Invalid or expired access token"));
  }
}
