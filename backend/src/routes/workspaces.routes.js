import { Router } from "express";
import { z } from "zod";
import { createWorkspace, listWorkspaces, updateWorkspace, deleteWorkspace, getWorkspaceForUser } from "../services/store.js";
import { HttpError } from "../utils/http-error.js";

const router = Router();

const createWorkspaceSchema = z.object({
  title: z.string().min(2),
  description: z.string().optional()
});

router.get("/", async (req, res, next) => {
  try {
    const rows = await listWorkspaces(req.user.id);
    res.json({ ok: true, data: rows });
  } catch (error) {
    next(error);
  }
});

router.post("/", async (req, res, next) => {
  try {
    const body = createWorkspaceSchema.parse(req.body);
    const workspace = await createWorkspace(req.user.id, body);
    res.status(201).json({ ok: true, data: workspace });
  } catch (error) {
    next(error);
  }
});
const updateWorkspaceSchema = z.object({
  title: z.string().min(2),
  description: z.string().optional()
});

router.patch("/:workspaceId", async (req, res, next) => {
  try {
    const workspace = await getWorkspaceForUser(req.user.id, req.params.workspaceId);
    if (!workspace) return next(new HttpError(404, "Workspace not found"));

    const body = updateWorkspaceSchema.parse(req.body);
    const updated = await updateWorkspace(req.user.id, workspace.id, body);
    res.json({ ok: true, data: updated });
  } catch (error) {
    next(error);
  }
});

router.delete("/:workspaceId", async (req, res, next) => {
  try {
    const workspace = await getWorkspaceForUser(req.user.id, req.params.workspaceId);
    if (!workspace) return next(new HttpError(404, "Workspace not found"));

    await deleteWorkspace(req.user.id, workspace.id);
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

export default router;
