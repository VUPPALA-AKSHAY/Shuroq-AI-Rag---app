import { Router } from "express";
import healthRoutes from "./health.routes.js";
import authRoutes from "./auth.routes.js";
import workspaceRoutes from "./workspaces.routes.js";
import chatRoutes from "./chats.routes.js";
import fileRoutes from "./files.routes.js";
import kaggleRoutes from "./kaggle.routes.js";
import searchRoutes from "./search.routes.js";
import ragRoutes from "./rag.routes.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();

router.use("/health", healthRoutes);
router.use("/auth", authRoutes);

router.use(requireAuth);
router.use("/workspaces", workspaceRoutes);
router.use(chatRoutes);
router.use(fileRoutes);
router.use("/kaggle", kaggleRoutes);
router.use("/search", searchRoutes);
router.use("/rag", ragRoutes);

export default router;
