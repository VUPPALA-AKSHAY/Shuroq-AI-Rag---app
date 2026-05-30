import { OAuth2Client } from "google-auth-library";
import { env } from "../config/env.js";
import { HttpError } from "../utils/http-error.js";
import { signAccessToken, signRefreshToken } from "../utils/jwt.js";
import { getOrCreateUserByEmail } from "./store.js";

const googleClient = env.GOOGLE_CLIENT_ID ? new OAuth2Client(env.GOOGLE_CLIENT_ID) : null;

export async function loginWithGoogleCredential(credential) {
  if (!credential) {
    throw new HttpError(400, "Google credential is required");
  }
  if (!googleClient || !env.GOOGLE_CLIENT_ID) {
    throw new HttpError(500, "GOOGLE_CLIENT_ID is not configured in backend env");
  }

  let ticket;
  try {
    ticket = await googleClient.verifyIdToken({
      idToken: credential,
      audience: env.GOOGLE_CLIENT_ID
    });
  } catch (error) {
    throw new HttpError(401, "Invalid Google credential or origin/client mismatch", {
      provider: "google",
      reason: error?.message || "verifyIdToken failed"
    });
  }

  const payload = ticket.getPayload();
  if (!payload?.email) {
    throw new HttpError(401, "Unable to verify Google account email");
  }

  const user = await getOrCreateUserByEmail({
    email: payload.email,
    name: payload.name || payload.given_name || payload.email,
    picture: payload.picture || ""
  });

  const accessToken = signAccessToken(user);
  const refreshToken = signRefreshToken(user);

  return {
    user,
    accessToken,
    refreshToken
  };
}
