import { Router } from "express";
import { z } from "zod";
import { HttpError } from "../utils/http-error.js";
import { getWorkspaceForUser, searchWorkspace } from "../services/store.js";

const router = Router();

const searchQuerySchema = z.object({
  q: z.string().min(1),
  workspaceId: z.string().min(1)
});

router.get("/", async (req, res, next) => {
  try {
    const query = searchQuerySchema.parse(req.query);
    const workspace = await getWorkspaceForUser(req.user.id, query.workspaceId);
    if (!workspace) return next(new HttpError(404, "Workspace not found"));

    const result = await searchWorkspace(req.user.id, workspace.id, query.q);
    res.json({ ok: true, data: result });
  } catch (error) {
    next(error);
  }
});

export default router;
