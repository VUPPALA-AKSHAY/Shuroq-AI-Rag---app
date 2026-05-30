import http from "node:http";
import { Server as SocketIOServer } from "socket.io";
import { app } from "./app.js";
import { env } from "./config/env.js";

const server = http.createServer(app);

const io = new SocketIOServer(server, {
  cors: {
    origin: env.CLIENT_ORIGIN,
    credentials: true
  }
});

io.on("connection", (socket) => {
  socket.on("join-workspace", (workspaceId) => {
    if (workspaceId) socket.join(`workspace:${workspaceId}`);
  });

  socket.on("disconnect", () => {

  });
});

server.listen(env.PORT, () => {
  console.log(`backend listening on http://localhost:${env.PORT}`);
});

