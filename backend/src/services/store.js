import { createClient } from "@supabase/supabase-js";
import { env } from "../config/env.js";
import { randomUUID } from "node:crypto";

const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

function mapUser(user) {
  if (!user) return null;
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    picture: user.picture,
    api_key_openai: user.api_key_openai || "",
    api_key_gemini: user.api_key_gemini || "",
    api_key_groq: user.api_key_groq || "",
    kaggle_username: user.kaggle_username || "",
    kaggle_key: user.kaggle_key || "",
    createdAt: user.created_at,
    updatedAt: user.updated_at
  };
}

function mapWorkspace(w) {
  if (!w) return null;
  return {
    id: w.id,
    userId: w.user_id,
    title: w.title,
    description: w.description || "",
    createdAt: w.created_at,
    updatedAt: w.updated_at
  };
}

function mapChat(c) {
  if (!c) return null;
  return {
    id: c.id,
    userId: c.user_id,
    workspaceId: c.workspace_id,
    title: c.title,
    createdAt: c.created_at,
    updatedAt: c.updated_at
  };
}

function mapMessage(m) {
  if (!m) return null;
  return {
    id: m.id,
    chatId: m.chat_id,
    role: m.role,
    content: m.content,
    sources: m.sources || [],
    createdAt: m.created_at
  };
}

function mapFile(f) {
  if (!f) return null;
  return {
    id: f.id,
    workspaceId: f.workspace_id,
    name: f.name,
    mimeType: f.mime_type,
    size: Number(f.size || 0),
    status: f.status,
    storagePath: f.storage_path || null,
    metadata: f.metadata || {},
    createdAt: f.created_at,
    updatedAt: f.updated_at
  };
}

export async function getOrCreateUserByEmail({ email, name = "", picture = "" }) {
  const key = email.toLowerCase().trim();

  const { data: existing, error: findError } = await supabase
    .from("users")
    .select("*")
    .eq("email", key)
    .maybeSingle();

  if (findError) throw findError;

  if (existing) {

    const updatePayload = {};
    if (name && name !== existing.name) updatePayload.name = name;
    if (picture && picture !== existing.picture) updatePayload.picture = picture;

    if (Object.keys(updatePayload).length > 0) {
      updatePayload.updated_at = new Date().toISOString();
      const { data: updated, error: updateError } = await supabase
        .from("users")
        .update(updatePayload)
        .eq("id", existing.id)
        .select()
        .single();
      if (updateError) throw updateError;
      return mapUser(updated);
    }
    return mapUser(existing);
  }

  const { data: newUser, error: insertError } = await supabase
    .from("users")
    .insert({
      email: key,
      name: name || key.split("@")[0],
      picture,
      api_key_openai: "",
      api_key_gemini: "",
      api_key_groq: "",
      kaggle_username: "",
      kaggle_key: ""
    })
    .select()
    .single();

  if (insertError) throw insertError;
  return mapUser(newUser);
}

export async function getUserById(userId) {
  const { data, error } = await supabase
    .from("users")
    .select("*")
    .eq("id", userId)
    .maybeSingle();

  if (error) throw error;
  return mapUser(data);
}

export async function updateUser(userId, payload) {
  const updatePayload = {};
  if (payload.name !== undefined) updatePayload.name = payload.name;
  if (payload.email !== undefined) updatePayload.email = payload.email.toLowerCase().trim();
  if (payload.api_key_openai !== undefined) updatePayload.api_key_openai = payload.api_key_openai;
  if (payload.api_key_gemini !== undefined) updatePayload.api_key_gemini = payload.api_key_gemini;
  if (payload.api_key_groq !== undefined) updatePayload.api_key_groq = payload.api_key_groq;
  if (payload.kaggle_username !== undefined) updatePayload.kaggle_username = payload.kaggle_username;
  if (payload.kaggle_key !== undefined) updatePayload.kaggle_key = payload.kaggle_key;

  updatePayload.updated_at = new Date().toISOString();

  const { data, error } = await supabase
    .from("users")
    .update(updatePayload)
    .eq("id", userId)
    .select()
    .single();

  if (error) throw error;
  return mapUser(data);
}

export async function listWorkspaces(userId) {
  const { data, error } = await supabase
    .from("workspaces")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return (data || []).map(mapWorkspace);
}

export async function createWorkspace(userId, payload) {
  const { data, error } = await supabase
    .from("workspaces")
    .insert({
      user_id: userId,
      title: payload.title,
      description: payload.description || ""
    })
    .select()
    .single();

  if (error) throw error;
  return mapWorkspace(data);
}

export async function updateWorkspace(userId, workspaceId, payload) {
  const { data, error } = await supabase
    .from("workspaces")
    .update({
      title: payload.title,
      ...(payload.description !== undefined && { description: payload.description })
    })
    .eq("id", workspaceId)
    .eq("user_id", userId)
    .select()
    .single();

  if (error) throw error;
  return mapWorkspace(data);
}

export async function deleteWorkspace(userId, workspaceId) {
  const { data, error } = await supabase
    .from("workspaces")
    .delete()
    .eq("id", workspaceId)
    .eq("user_id", userId)
    .select();

  if (error) throw error;
  return data;
}

export async function getWorkspaceForUser(userId, workspaceId) {
  const { data, error } = await supabase
    .from("workspaces")
    .select("*")
    .eq("id", workspaceId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw error;
  return mapWorkspace(data);
}

export async function listChats(userId, workspaceId) {
  const { data, error } = await supabase
    .from("chats")
    .select("*")
    .eq("user_id", userId)
    .eq("workspace_id", workspaceId)
    .order("updated_at", { ascending: false });

  if (error) throw error;
  return (data || []).map(mapChat);
}

export async function createChat(userId, workspaceId, payload) {

  const { data: chat, error: chatError } = await supabase
    .from("chats")
    .insert({
      user_id: userId,
      workspace_id: workspaceId,
      title: payload.title || "New chat"
    })
    .select()
    .single();

  if (chatError) throw chatError;

  const { error: msgError } = await supabase
    .from("messages")
    .insert({
      chat_id: chat.id,
      role: "assistant",
      content: "Welcome. Choose a file from the Datasets panel on the right, then start your chat.",
      sources: []
    });

  if (msgError) throw msgError;

  return mapChat(chat);
}

export async function updateChat(userId, chatId, payload) {
  const { data, error } = await supabase
    .from("chats")
    .update({
      title: payload.title
    })
    .eq("id", chatId)
    .eq("user_id", userId)
    .select()
    .single();

  if (error) throw error;
  return mapChat(data);
}

export async function deleteChat(userId, chatId) {
  const { data, error } = await supabase
    .from("chats")
    .delete()
    .eq("id", chatId)
    .eq("user_id", userId)
    .select();

  if (error) throw error;
  return data && data.length > 0;
}

export async function getChatForUser(userId, chatId) {
  const { data, error } = await supabase
    .from("chats")
    .select("*")
    .eq("id", chatId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw error;
  return mapChat(data);
}

export async function listMessages(userId, chatId) {

  const chat = await getChatForUser(userId, chatId);
  if (!chat) return null;

  const { data, error } = await supabase
    .from("messages")
    .select("*")
    .eq("chat_id", chatId)
    .order("created_at", { ascending: true });

  if (error) throw error;
  return (data || []).map(mapMessage);
}

export async function addMessage(userId, chatId, payload) {

  const chat = await getChatForUser(userId, chatId);
  if (!chat) return null;

  const { data: msg, error: msgError } = await supabase
    .from("messages")
    .insert({
      chat_id: chatId,
      role: payload.role,
      content: payload.content,
      sources: payload.sources || []
    })
    .select()
    .single();

  if (msgError) throw msgError;

  await supabase
    .from("chats")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", chatId);

  return mapMessage(msg);
}

export async function listFiles(userId, workspaceId) {

  const workspace = await getWorkspaceForUser(userId, workspaceId);
  if (!workspace) return null;

  let allData = [];
  let page = 0;
  const pageSize = 1000;
  let hasMore = true;

  while (hasMore) {
    const { data, error } = await supabase
      .from("files")
      .select("*")
      .eq("workspace_id", workspaceId)
      .range(page * pageSize, (page + 1) * pageSize - 1)
      .order("created_at", { ascending: false });

    if (error) throw error;

    allData = allData.concat(data || []);
    if (!data || data.length < pageSize) {
      hasMore = false;
    } else {
      page++;
    }
  }

  return allData.map(mapFile);
}

export async function addFile(userId, workspaceId, payload) {

  const workspace = await getWorkspaceForUser(userId, workspaceId);
  if (!workspace) return null;

  const { data, error } = await supabase
    .from("files")
    .insert({
      workspace_id: workspaceId,
      name: payload.name,
      mime_type: payload.mimeType || "application/octet-stream",
      size: payload.size || 0,
      status: payload.status || "uploaded",
      storage_path: payload.storagePath || null,
      metadata: payload.metadata || {}
    })
    .select()
    .single();

  if (error) throw error;
  return mapFile(data);
}

export async function addFilesBatch(userId, workspaceId, filesPayload) {

  const workspace = await getWorkspaceForUser(userId, workspaceId);
  if (!workspace) return null;

  if (!filesPayload || filesPayload.length === 0) return [];

  const chunkSize = 500;
  const insertedFiles = [];

  for (let i = 0; i < filesPayload.length; i += chunkSize) {
    const chunk = filesPayload.slice(i, i + chunkSize);
    const rows = chunk.map(payload => ({
      workspace_id: workspaceId,
      name: payload.name,
      mime_type: payload.mimeType || "application/octet-stream",
      size: payload.size || 0,
      status: payload.status || "uploaded",
      storage_path: payload.storagePath || null,
      metadata: payload.metadata || {}
    }));

    const { data, error } = await supabase
      .from("files")
      .insert(rows)
      .select();

    if (error) throw error;
    if (data) {
      insertedFiles.push(...data.map(mapFile));
    }
  }

  return insertedFiles;
}

export async function updateFile(userId, workspaceId, fileId, payload) {

  const workspace = await getWorkspaceForUser(userId, workspaceId);
  if (!workspace) return null;

  const updatePayload = {};
  if (payload.name !== undefined) updatePayload.name = payload.name;
  if (payload.mimeType !== undefined) updatePayload.mime_type = payload.mimeType;
  if (payload.size !== undefined) updatePayload.size = payload.size;
  if (payload.status !== undefined) updatePayload.status = payload.status;
  if (payload.storagePath !== undefined) updatePayload.storage_path = payload.storagePath;
  if (payload.metadata !== undefined) updatePayload.metadata = payload.metadata;

  updatePayload.updated_at = new Date().toISOString();

  const { data, error } = await supabase
    .from("files")
    .update(updatePayload)
    .eq("id", fileId)
    .eq("workspace_id", workspaceId)
    .select()
    .single();

  if (error) throw error;
  return mapFile(data);
}

export async function deleteFile(userId, workspaceId, fileIdOrName) {

  const workspace = await getWorkspaceForUser(userId, workspaceId);
  if (!workspace) return false;

  let query = supabase.from("files").delete().eq("workspace_id", workspaceId);

  if (fileIdOrName.includes("-") && fileIdOrName.length === 36) {

    query = query.eq("id", fileIdOrName);
  } else {
    query = query.eq("name", fileIdOrName);
  }

  const { data, error, count } = await query.select();
  if (error) throw error;
  return (data || []).length > 0;
}

export async function deleteFilesBatch(userId, workspaceId, fileIdsOrNames) {
  const workspace = await getWorkspaceForUser(userId, workspaceId);
  if (!workspace) return false;

  if (!fileIdsOrNames || fileIdsOrNames.length === 0) return true;

  const ids = [];
  const names = [];

  const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  for (const item of fileIdsOrNames) {
    if (UUID_REGEX.test(item)) {
      ids.push(item);
    } else {
      names.push(item);
    }
  }

  const chunkSize = 200;
  const promises = [];

  if (ids.length > 0) {
    for (let i = 0; i < ids.length; i += chunkSize) {
      const chunk = ids.slice(i, i + chunkSize);
      promises.push(
        supabase
          .from("files")
          .delete()
          .eq("workspace_id", workspaceId)
          .in("id", chunk)
          .then(({ error }) => {
            if (error) throw error;
          })
      );
    }
  }

  if (names.length > 0) {
    for (let i = 0; i < names.length; i += chunkSize) {
      const chunk = names.slice(i, i + chunkSize);
      promises.push(
        supabase
          .from("files")
          .delete()
          .eq("workspace_id", workspaceId)
          .in("name", chunk)
          .then(({ error }) => {
            if (error) throw error;
          })
      );
    }
  }

  if (promises.length > 0) {
    await Promise.all(promises);
  }

  return true;
}

export async function searchWorkspace(userId, workspaceId, q) {

  const workspace = await getWorkspaceForUser(userId, workspaceId);
  if (!workspace) return null;

  const term = q.toLowerCase();

  const { data: filesData, error: filesError } = await supabase
    .from("files")
    .select("*")
    .eq("workspace_id", workspaceId)
    .ilike("name", `%${term}%`);

  if (filesError) throw filesError;

  const { data: chatsData, error: chatsError } = await supabase
    .from("chats")
    .select("id")
    .eq("workspace_id", workspaceId);

  if (chatsError) throw chatsError;

  const chatIds = (chatsData || []).map((c) => c.id);
  const messages = [];

  if (chatIds.length > 0) {
    const { data: msgData, error: msgError } = await supabase
      .from("messages")
      .select("*, chats!inner(*)")
      .in("chat_id", chatIds)
      .ilike("content", `%${term}%`);

    if (msgError) throw msgError;

    for (const m of msgData || []) {
      messages.push({
        chatId: m.chat_id,
        messageId: m.id,
        role: m.role,
        content: m.content,
        createdAt: m.created_at
      });
    }
  }

  return {
    files: (filesData || []).map(mapFile),
    messages
  };
}
