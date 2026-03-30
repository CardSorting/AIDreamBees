# 🔌 API Reference

DreamBeesAI provides both a REST API for standard requests and a WebSocket interface for real-time reactivity.

---

## 🌐 REST API

All endpoints are hosted at `http://localhost:3001` (or your configured `PORT`).

### 1. Chat Interaction
**POST** `/api/chat`
Submit a new message to the cognitive substrate.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `message` | `string` | No | The text message to process. |
| `images` | `string[]` | No | Array of base64 encoded images. |
| `history` | `any[]` | No | Current chat history for resonance. |
| `useGrid` | `boolean` | No | If true, multiple bot responses will be combined into a 2x2 grid. |
| `correlationId` | `string` | No | Unique ID to correlate REST request with WS events. |

**Response**:
-   `200 OK`: `{ "status": "success" }`
-   `400 Bad Request`: `{ "error": "Cognitive payload violation", "details": [...] }`

### 2. Cognitive History
**GET** `/api/history`
Retrieve the entire cognitive substrate history.
-   **Response**: `200 OK` (Array of Message Objects)

**DELETE** `/api/history`
Purge the cognitive substrate.
-   **Response**: `200 OK` `{ "status": "success" }`

**DELETE** `/api/history/:id`
Delete a specific cognitive node by its UUID.
-   **Response**: `200 OK` `{ "status": "success" }`

### 3. Structural Health
**GET** `/api/health`
Get live performance and entropy metrics of the substrate.
-   **Response**: `200 OK` (Health metrics object)

---

## ⚡ WebSocket Events (Soketi)

Events are broadcasted on the `presence-chat` channel.

| Event Name | Data Payload | Description |
|---|---|---|
| `bot-thinking` | `{ "isThinking": boolean, "correlationId": string }` | Emitted when the AI starts/stops processing. |
| `bot-message` | `{ "message": string, "images": string[], "user": string, "soundness": number, "isGrounded": boolean, "correlationId": string }` | The final AI response broadcasted globally. |
| `system-update` | `{ "health": object, "correlationId": string }` | Live updates on memory usage, entropy, and substrate stability. |

---

## 📈 Request/Response Models

### Message Object
```json
{
  "id": "UUID-V4",
  "user": "Nano Banana 2",
  "message": "AI Generated text...",
  "type": "bot",
  "timestamp": "ISO-8601",
  "images": ["base64...", "base64..."],
  "sourceImages": ["base64...", "base64..."],
  "soundness": 0.99
}
```

### Health Metrics
```json
{
  "entropy": 0.15,
  "health": "Optimal",
  "soketiStatus": "Optimal",
  "violations": 0,
  "nodeCount": 142,
  "uptime": 3600.5,
  "substrateStability": 0.99
}
```
