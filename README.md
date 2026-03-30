# Nano Banana 2 Chat App (Soketi Powered)

A high-performance, real-time chat interface for the **Nano Banana 2** model.

## Prerequisites
- Node.js & npm
- Soketi (will be installed automatically via `start-soketi.sh`)

## Getting Started

### 1. Start the Soketi Server
In a new terminal, run the following to start the WebSocket server:
```bash
./start-soketi.sh
```
This will start the server on `127.0.0.1:6001`.

### 2. Start the AI Simulation Bot
In another terminal, navigate to the `backend` folder and start the bot:
```bash
cd backend
npm start
```
The bot listens for messages on the `presence-chat` channel and uses information from `nano.md` to respond.

### 3. Start the Frontend
In a third terminal, navigate to the `frontend` folder and start the development server:
```bash
cd frontend
npm run dev
```
Open [http://localhost:5173](http://localhost:5173) in your browser to start chatting!

## Features
- **ChatGPT-Style UI**: Modern dark mode with message bubbles and a sleek sidebar.
- **Real-Time WebSockets**: Powered by Soketi for instantaneous communication.
- **Thinking State**: Visual indicators when the AI is "thinking" about its response.
- **Context-Aware**: The bot is pre-loaded with the Nano Banana 2 technical specifications.
