# Shuroq AI RAG Chatbot

Shuroq AI is a chatbot app for asking questions about your own files and datasets.

You can upload documents like PDF, Word, CSV, Excel, text, JSON, Markdown, and other file types, or import datasets from Kaggle. After that, you can chat with the data and get answers in simple language. The app can use RAG retrieval, which means it first searches the uploaded file content and then sends the most useful context to the AI model.

## Clone This Repository

Use this command to download the project:

```bash
git clone https://github.com/VUPPALA-AKSHAY/Shuroq-AI-Rag---app.git
cd Shuroq-AI-Rag---app
```

Vercel link:

https://shuroq-ai-rag-app.vercel.app/

Backend API:

https://shuroq-backend.onrender.com

Repository link:

https://github.com/VUPPALA-AKSHAY/Shuroq-AI-Rag---app

## Main Features

- Chat with uploaded documents and datasets.
- Create separate workspaces for different projects.
- Upload local files like PDF, CSV, Excel, text, JSON, Markdown, and other document files.
- Import datasets directly from Kaggle by search or by dataset URL.
- Preview uploaded files inside the app.
- View CSV data in tables with search and pagination.
- RAG mode searches document chunks before answering.
- Direct Model mode sends selected document text directly to the AI model.
- Choose between supported AI models from the app settings.
- Change response temperature for more factual or more creative answers.
- Rename and delete workspaces, chats, and datasets.
- Light and dark theme support.

## App Menus

### Login

This is the first screen. The user logs in with an email. In development mode, the app supports a simple dev login flow.

### Dashboard

The Dashboard is the main home page.

Here you can:

- See all workspaces.
- Create a new analysis chat.
- Select the active workspace.
- Search workspaces.
- Rename or delete a workspace.
- See recent chats for the selected workspace.
- Rename or delete chats.

### Analysis

The Analysis menu opens the chatbot.

Here you can:

- Ask questions about your uploaded files.
- Select a document or dataset to chat with.
- Upload and process files for RAG retrieval.
- Preview documents, PDFs, and tables.
- Switch between RAG retrieval and Direct Model mode.
- Adjust temperature.

### Datasets

The Datasets menu is used to add and manage data.

Here you can:

- Search Kaggle datasets.
- Import a Kaggle dataset by URL.
- Upload local files.
- View all datasets in the Active Workspace Datasets.
- Search downloaded or uploaded datasets.
- Start a chat with a specific file.
- Delete one dataset or delete many selected datasets.

### Settings

The Settings menu is used to configure the app.

Here you can:

- Update your name and email.
- Add OpenAI and Gemini API keys.
- Select the default answer model.
- Select RAG mode or Direct Model mode.
- Change temperature.

By default, all necessary platform APIs are already integrated.

## How The Chatbot Works (RAG Mode)

1. You select a workspace.
2. You upload or choose a file from Datasets.
3. The backend stores the file and extracted text.
4. The AI service splits the file text into smaller chunks.
5. The AI service creates embeddings and stores them in the vector database.
6. When you ask a question, the retriever searches for the most relevant chunks.
7. The AI model answers using those retrieved chunks as context.
8. The frontend shows the answer and source information in the chat.

## How The Chatbot Works (Direct Mode)

1. You select a workspace.
2. You upload or choose a file from Datasets.
3. The backend stores the file and extracted text.
4. When you ask a question, the backend sends the selected file's text directly to the AI model.
5. The AI model answers using the selected file content.
6. The frontend shows the answer in the chat.

## Deployment

- Frontend: Vercel
- Backend API: Render
- AI/RAG service: Private VPS
- RAG embeddings: FastEmbed with BAAI/bge-base-en-v1.5
- Vector database: Qdrant, used by the VPS AI/RAG service.

## Tech Stack

### Frontend

- React
- Vite
- React Router
- Tailwind CSS
- Framer Motion
- Axios
- Socket.IO client
- Lucide React icons
- Radix UI / custom UI components

### Backend

- Node.js
- Express
- Zod
- JWT authentication
- Helmet
- CORS
- Morgan
- Axios
- PapaParse
- AdmZip
- Supabase support

## RAG Tech Stack

- Embeddings: FastEmbed
- Embedding model: BAAI/bge-base-en-v1.5
- Vector DB: Qdrant
- Retriever: Hybrid retrieval
- Ranking: Reciprocal Rank Fusion
- Chunking: Character-based chunks with overlap
- Answer model: GLM-5 via Cerebras-compatible API

### External Services

- Kaggle API for dataset search and import
- Gemini for model or embedding workflows
- Cerebras / GLM model endpoint for chat answers
- Supabase for storage or database workflows, depending on configuration
