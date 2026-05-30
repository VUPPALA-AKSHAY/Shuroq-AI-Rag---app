import { Router } from "express";
import { z } from "zod";
import { loginWithGoogleCredential } from "../services/auth.service.js";
import { HttpError } from "../utils/http-error.js";
import { verifyRefreshToken, signAccessToken, signRefreshToken } from "../utils/jwt.js";
import { getUserById, getOrCreateUserByEmail, updateUser } from "../services/store.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();

const googleBodySchema = z.object({
  credential: z.string().min(1)
});

router.post("/google", async (req, res, next) => {
  try {
    const body = googleBodySchema.parse(req.body);
    const result = await loginWithGoogleCredential(body.credential);

    res.json({
      ok: true,
      data: result
    });
  } catch (error) {
    next(error);
  }
});

const refreshBodySchema = z.object({
  refreshToken: z.string().min(1)
});

router.post("/refresh", async (req, res, next) => {
  try {
    const body = refreshBodySchema.parse(req.body);
    const payload = verifyRefreshToken(body.refreshToken);
    const user = await getUserById(payload.sub);

    if (!user) throw new HttpError(401, "Refresh token user not found");

    const accessToken = signAccessToken(user);
    const refreshToken = signRefreshToken(user);

    res.json({
      ok: true,
      data: { accessToken, refreshToken }
    });
  } catch (error) {
    next(new HttpError(401, "Invalid refresh token"));
  }
});

const devLoginSchema = z.object({
  email: z.string().email(),
  name: z.string().optional()
});

router.post("/dev-login", async (req, res, next) => {
  try {
    const body = devLoginSchema.parse(req.body);
    const user = await getOrCreateUserByEmail({
      email: body.email,
      name: body.name || body.email.split("@")[0]
    });

    const accessToken = signAccessToken(user);
    const refreshToken = signRefreshToken(user);

    res.json({
      ok: true,
      data: { user, accessToken, refreshToken }
    });
  } catch (error) {
    next(error);
  }
});

router.get("/me", requireAuth, (req, res) => {
  res.json({
    ok: true,
    data: req.user
  });
});

const updateMeSchema = z.object({
  name: z.string().min(1).optional(),
  email: z.string().email().optional(),
  api_key_openai: z.string().optional(),
  api_key_gemini: z.string().optional(),
  api_key_groq: z.string().optional(),
  kaggle_username: z.string().optional(),
  kaggle_key: z.string().optional()
});

router.patch("/me", requireAuth, async (req, res, next) => {
  try {
    const body = updateMeSchema.parse(req.body);
    const user = await updateUser(req.user.id, body);
    if (!user) return next(new HttpError(404, "User not found"));
    res.json({ ok: true, data: user });
  } catch (error) {
    next(error);
  }
});

export default router;
