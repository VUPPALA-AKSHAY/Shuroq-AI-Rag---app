import { Router } from "express";
import { z } from "zod";
import { HttpError } from "../utils/http-error.js";
import {
  createChat,
  listChats,
  updateChat,
  deleteChat,
  addMessage,
  listMessages,
  getWorkspaceForUser
} from "../services/store.js";

const router = Router();

const createChatSchema = z.object({
  title: z.string().min(1).optional()
});

router.get("/workspaces/:workspaceId/chats", async (req, res, next) => {
  try {
    const workspace = await getWorkspaceForUser(req.user.id, req.params.workspaceId);
    if (!workspace) return next(new HttpError(404, "Workspace not found"));

    const data = await listChats(req.user.id, workspace.id);
    res.json({ ok: true, data });
  } catch (error) {
    next(error);
  }
});

router.post("/workspaces/:workspaceId/chats", async (req, res, next) => {
  try {
    const workspace = await getWorkspaceForUser(req.user.id, req.params.workspaceId);
    if (!workspace) return next(new HttpError(404, "Workspace not found"));

    const body = createChatSchema.parse(req.body);
    const chat = await createChat(req.user.id, workspace.id, body);
    res.status(201).json({ ok: true, data: chat });
  } catch (error) {
    next(error);
  }
});

router.get("/chats/:chatId/messages", async (req, res, next) => {
  try {
    const data = await listMessages(req.user.id, req.params.chatId);
    if (!data) return next(new HttpError(404, "Chat not found"));
    res.json({ ok: true, data });
  } catch (error) {
    next(error);
  }
});

const createMessageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().min(1),
  sources: z.array(z.string()).optional()
});

router.post("/chats/:chatId/messages", async (req, res, next) => {
  try {
    const body = createMessageSchema.parse(req.body);
    const message = await addMessage(req.user.id, req.params.chatId, body);
    if (!message) return next(new HttpError(404, "Chat not found"));
    res.status(201).json({ ok: true, data: message });
  } catch (error) {
    next(error);
  }
});
const updateChatSchema = z.object({
  title: z.string().min(1)
});

router.patch("/chats/:chatId", async (req, res, next) => {
  try {
    const body = updateChatSchema.parse(req.body);
    const updated = await updateChat(req.user.id, req.params.chatId, body);
    res.json({ ok: true, data: updated });
  } catch (error) {
    next(error);
  }
});

router.delete("/chats/:chatId", async (req, res, next) => {
  try {
    const deleted = await deleteChat(req.user.id, req.params.chatId);
    if (!deleted) {
      throw new HttpError(404, "Chat not found or could not be deleted");
    }
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

export default router;
