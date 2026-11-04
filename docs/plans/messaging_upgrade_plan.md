# 📱 QuizFocus Messaging Service — Master Feature & Architecture Plan

> **Benchmark References**: WhatsApp, Instagram DMs, Facebook Messenger, Telegram, Discord, Slack  
> **Scope**: Backend (`services/message-service`), API Gateway (`services/api-gateway`), Desktop Frontend (`apps/desktop-web`), Mobile Frontend (`apps/mobile-web`)

---

## 1. Executive Summary & Benchmark Matrix

The current QuizFocus messaging service relies on basic REST request/response endpoints with periodic frontend polling. To bring QuizFocus up to parity with contemporary communication platforms while tailoring it specifically for a competitive quiz and study platform, this plan introduces real-time bidirectional communication, rich micro-interactions, collaborative study features, and cross-platform native polish.

### Benchmark Analysis

| Feature | WhatsApp | Instagram DMs | Messenger | Telegram | Discord | QuizFocus Target |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: |
| **Real-Time Transport** | WebSocket | MQTT / WS | MQTT / WS | MTProto / WS | WebSocket | **Socket.IO + Redis Adapter** |
| **Delivery Ticks** | ✓ Sent, Delivered, Read | ✓ Sent, Seen | ✓ Sent, Delivered, Avatar seen | ✓ Sent, Read | ✓ Read receipts | **✓ Sent, Delivered, Read (Ticks + Avatar)** |
| **Presence & Typing** | Online + Typing | Active now + Typing | Active now + Bubble typing | Detailed status + Typing | Rich Presence + Typing | **Online status, last seen, debounce typing** |
| **Reactions** | 6 default + any emoji | Double-tap ❤️ + emoji bar | Quick emoji bar | Animated reactions | Custom emojis | **Quick bar (❤️, 🔥, 👏, 😂, 💡, 🧠) + picker** |
| **Replies & Threads** | Swipe to quote | Swipe to quote | Swipe to quote | Inline quote & threads | Thread branches | **Swipe-to-quote / nested quote preview** |
| **Message Editing** | 15-min window | 15-min window | Edit history | Unlimited edit | Unlimited edit | **15-min window with "(edited)" flag** |
| **Voice Notes** | Waveform + Speed | Audio wave | Audio wave | Waveform + Speed | Voice channels | **Waveform audio recorder + 1x/1.5x/2x playback**|
| **Interactive Cards** | Location/Contact | Shared Posts/Stories | Games/Cards | Mini Apps/Bots | Bot Embeds/Buttons | **Interactive Quiz & 1v1 Battle Cards** |
| **Group Chats** | Groups + Communities| Group DMs | Group DMs | Channels + Supergroups | Servers + Channels | **Study Circles / Quiz Rooms with Admin Roles** |
| **Search & Media** | In-chat + Global | Global | Global | Fast cloud search | Filtered search | **Full-text search + Media/Links/Files gallery** |

---

## 2. Current State Audit (QuizFocus `message-service`)

### What Exists Today:
- **Backend**: Express service on port 5005 with MongoDB (`Conversation`, `Message`, `Notification`, `User` models).
- **Routes**: REST endpoints for listing conversations, fetching messages, sending a text message, and marking as read.
- **Frontend**: Desktop web has a basic single-file `Messages.jsx` component relying on `fetch` polling every 5-10 seconds.
- **Mobile Web**: No messaging UI exists yet in `apps/mobile-web`.

### Current Gaps:
1. **No WebSocket / Real-time Gateway**: Messages arrive only after manual reload or poll interval.
2. **No Presence or Typing Indicators**: Users cannot tell if their peer is active or writing.
3. **No Rich Media or File Sharing**: Plain text only; no images, audio, or PDFs.
4. **No Quiz Platform Integration**: Cannot challenge a friend, share an MCQ question, or send quiz results in a conversation.
5. **No Group Study Chats**: Only 1-to-1 conversations are supported.
6. **No Reactions, Quotes, or Editing**: Missing standard modern messaging ergonomics.
7. **Mobile Web Missing**: Mobile learners cannot access chat while studying on phones.

---

## 3. System Architecture & Tech Stack

```
 ┌───────────────────────┐         ┌───────────────────────┐
 │   apps/desktop-web    │         │    apps/mobile-web    │
 └──────────┬────────────┘         └──────────┬────────────┘
            │ HTTP (REST) / WSS (Socket.IO)   │
            ▼                                 ▼
 ┌─────────────────────────────────────────────────────────┐
 │            API Gateway (Express + Socket Proxy)         │
 └────────────────────────────┬────────────────────────────┘
                              │
            ┌─────────────────┴─────────────────┐
            ▼                                   ▼
 ┌─────────────────────────┐         ┌─────────────────────────┐
 │  message-service (HTTP) │         │ message-service (Socket)│
 │  - Conversation Routes  │         │ - Connection Handshake  │
 │  - Search & Analytics   │         │ - Typing & Presence     │
 │  - Upload Handler (S3)  │         │ - Ephemeral Events      │
 └──────────┬──────────────┘         └──────────┬──────────────┘
            │                                   │
            ├─────────────────┬─────────────────┘
            ▼                 ▼
 ┌────────────────────┐ ┌────────────────────┐
 │   MongoDB Cluster  │ │ Redis Pub/Sub Cache│
 │ - Conversations    │ │ - Socket User Map  │
 │ - Messages         │ │ - Online Sessions  │
 │ - Notifications    │ │ - Typing state TTL │
 └────────────────────┘ └────────────────────┘
```

---

## 4. Phase-by-Phase Structural Feature Breakdown

### Phase 1: Real-Time Engine, Presence & Delivery Lifecycle
*Benchmark: WhatsApp & Telegram*

1. **Socket.IO Real-Time Infrastructure**:
   - Integrate `socket.io` in `message-service` and proxy WebSocket connections through API Gateway.
   - JWT authentication handshake: validate user token on `connection` event.
   - Room-based architecture: users join personal rooms (`user:<userId>`) and active conversation rooms (`conv:<convId>`).
2. **Live Presence & Heartbeats**:
   - `user:online` and `user:offline` events broadcast to all user contact conversations.
   - Store active socket mappings in Redis / in-memory map with TTL heartbeats.
   - "Last active at [timestamp]" display with humanized relative time ("Active now", "Active 5m ago", "Yesterday").
3. **Typing Indicators (Debounced)**:
   - Client sends `typing:start` on keypress, auto-throttled via 2-second debounce timer.
   - Client sends `typing:stop` on input blur or after 3 seconds of inactivity.
   - Animated 3-dot typing bubble in conversation header and message stream ("Alex is typing...").
4. **Three-State Delivery Lifecycle**:
   - **State 1: Sent (Single Gray Check `✓`)** — Saved in database.
   - **State 2: Delivered (Double Gray Checks `✓✓`)** — Recipient device received socket event.
   - **State 3: Read (Double Blue Checks `✓✓` / Recipient Avatar)** — Recipient opened the thread and message entered viewport.

---

### Phase 2: Modern Micro-Interactions & Message Lifecycle
*Benchmark: Instagram DMs & Messenger*

1. **Emoji Reactions**:
   - Long-press (mobile) or hover action button (desktop) triggers floating pill with quick emojis: ❤️, 😂, 😮, 😢, 🔥, 👏, 🧠.
   - Custom emoji picker button (`+`) for full emoji spectrum.
   - Tapping an existing reaction toggles the current user's reaction on/off.
   - Reaction badges stacked neatly at the bottom-right of message bubbles with popover showing who reacted.
2. **Swipe-to-Reply & Quoted Messages**:
   - Desktop: Hover quick-action button "Reply".
   - Mobile: Horizontal drag/swipe on message bubble reveals reply arrow icon with spring haptic feedback.
   - Quoted preview pinned above input bar with close/cancel button (`✕`).
   - Tapping a quoted snippet inside a message smoothly scrolls the viewport to highlight the original message.
3. **Message Editing & Revocation**:
   - **Edit Message**: Allowed within 15 minutes of sending; shows subtle `(edited)` indicator and tooltip with edit timestamp.
   - **Delete Options**:
     - *Delete for Me*: Hides message locally for current user.
     - *Delete for Everyone*: Soft-deletes message content and replaces with *"This message was deleted"*.
4. **Copy, Forward & Bookmarking**:
   - One-click copy text to clipboard with Sonner toast notification.
   - Forward message to another conversation or group with contact search dialog.
   - Star/Save message for quick retrieval in a "Starred Messages" drawer.

---

### Phase 3: Media, Voice Notes & Quiz Platform Integrations
*Benchmark: Discord, WhatsApp & QuizFocus Proprietary*

1. **Rich Media Attachments**:
   - Upload images (JPEG, PNG, WebP) and documents (PDF, DOCX) up to 15MB.
   - Multi-image grid layout (1, 2, 3, 4+ gallery preview with lightbox zoom modal).
   - In-app image preview with progress bar while uploading.
2. **Voice Notes (Audio Messages)**:
   - Microphone hold/lock button on mobile and desktop.
   - Dynamic real-time visual frequency waveform during recording.
   - Instant playback scrubber with audio duration counter and speed switcher (`1.0x`, `1.5x`, `2.0x`).
3. **QuizFocus Proprietary: Interactive Quiz & Battle Cards in Chat**:
   - **Share Quiz Card**: Embed rich preview of any MCQ quiz (Title, Category, Questions Count, Difficulty, Best Score) with a direct "Start Quiz" CTA button.
   - **1v1 Challenge Invite**: Send a live challenge invite to the peer with wager/points and countdown.
   - **Quiz Result Brag Card**: Direct button on quiz completion screen to share score badge, accuracy graph, and leaderboard rank into chat.
4. **Smart Link Previews (OpenGraph)**:
   - Automatically extract Title, Description, and Thumbnail when links are pasted.

---

### Phase 4: Group Conversations & Study Circles
*Benchmark: Telegram, WhatsApp & Slack*

1. **Group Chat Creation & Profiles**:
   - Create group modal: Name, Description, Group Avatar upload, and multi-select participant picker.
   - Custom join link or invite code.
2. **Role-Based Permissions**:
   - Roles: `Owner`, `Admin`, `Member`.
   - Settings: Only admins can change group info, toggle who can send messages (announcement mode).
3. **@Mentions & Autocomplete**:
   - Typing `@` triggers instant member dropdown with avatars and usernames.
   - Selecting a member inserts highlit mention token.
   - Notifications specifically flag when a user is directly mentioned (`@username` or `@everyone`).
4. **Dedicated Study Circles**:
   - Link group chats directly to specific subjects (e.g., "NEET Biology Study Group", "Gate CS 2027 Group").
   - Pinned quiz challenge of the day at the top of the group chat header.

---

### Phase 5: Search, Discovery & Conversation Management
*Benchmark: Telegram & WhatsApp*

1. **Conversation List Ergonomics**:
   - Filter tabs: `All`, `Unread`, `Groups`, `Study Circles`.
   - **Pin Chats**: Pin up to 5 critical conversations to top of list with pin icon.
   - **Mute Notifications**: Mute options (8 Hours, 1 Week, Always).
   - **Archive Chats**: Hide conversations from main inbox; easily access in "Archived" section.
2. **Full-Text In-Chat & Global Search**:
   - Search bar across all conversations and inside an active conversation.
   - Match highlighting with keyboard up/down navigation (`Enter` to jump between matches).
3. **Conversation Info Sidebar / Sheet**:
   - Participant list with online badges and mutual quiz stats.
   - Shared Media, Links, and Documents tabbed gallery.
   - Starred messages list.

---

### Phase 6: Privacy, Moderation & Push Notifications
*Benchmark: Instagram & Signal*

1. **User Safety & Moderation**:
   - Block / Unblock user mechanism with automatic conversation restriction.
   - Report user / message with preset reason tags (Spam, Harassment, Inappropriate Content).
   - Disappearing messages toggle (24 hours / 7 days auto-purge).
2. **Notifications & Alerts**:
   - In-app sonner toast notification when receiving messages while browsing quizzes.
   - Audio feedback (subtle pleasant click/pop on sent message, chime on received).
   - Unread badges: Synced badge counter on desktop navbar and mobile bottom navigation bar.

---

### Phase 7: Responsive Mobile-First & Desktop UI/UX Implementation
*Benchmark: Emil Kowalski UI Principles & Apple HIG*

1. **Desktop Web (`apps/desktop-web`)**:
   - Two-pane fluid split layout: Left conversation sidebar (fixed width / collapsible), Right message viewport.
   - Keyboard shortcuts: `Esc` to close chat, `Ctrl+K` to search messages, `Enter` to send, `Shift+Enter` for newline.
   - Smooth auto-scroll with "Jump to bottom" floating pill when scrolled up.
2. **Mobile Web (`apps/mobile-web`)**:
   - Modern mobile chat screen (`/messages` & `/messages/:id`).
   - Bottom navigation integration with unread badge counter.
   - Native slide-in navigation between conversation list and active chat view.
   - Keyboard viewport adjustment (`interactive-widget=resizes-content`) preventing layout jumps on iOS/Android virtual keyboards.
   - Native-feel tap states (`:active { transform: scale(0.97); }`), safe area padding (`env(safe-area-inset-bottom)`).

---

## 5. Enhanced Data Schemas (MongoDB)

### `Message` Schema Upgrades
```javascript
{
  conversationId: { type: ObjectId, ref: 'Conversation', required: true, index: true },
  sender: { type: ObjectId, ref: 'User', required: true },
  type: { 
    type: String, 
    enum: ['text', 'image', 'audio', 'document', 'quiz_share', 'challenge_invite'], 
    default: 'text' 
  },
  content: { type: String, default: '' },
  media: {
    url: String,
    thumbnailUrl: String,
    fileName: String,
    fileSize: Number,
    mimeType: String,
    duration: Number // for audio voice notes in seconds
  },
  quizMetadata: {
    quizId: { type: ObjectId, ref: 'Quiz' },
    quizTitle: String,
    category: String,
    questionCount: Number,
    challengeScore: Number
  },
  replyTo: {
    messageId: { type: ObjectId, ref: 'Message' },
    senderName: String,
    snippet: String
  },
  reactions: [
    {
      userId: { type: ObjectId, ref: 'User' },
      emoji: String,
      createdAt: { type: Date, default: Date.now }
    }
  ],
  deliveryStatus: {
    type: String,
    enum: ['sent', 'delivered', 'read'],
    default: 'sent'
  },
  readBy: [{
    userId: { type: ObjectId, ref: 'User' },
    readAt: { type: Date, default: Date.now }
  }],
  isEdited: { type: Boolean, default: false },
  editedAt: Date,
  isDeleted: { type: Boolean, default: false },
  deletedFor: [{ type: ObjectId, ref: 'User' }],
  createdAt: { type: Date, default: Date.now, index: true }
}
```

### `Conversation` Schema Upgrades
```javascript
{
  isGroup: { type: Boolean, default: false },
  groupName: String,
  groupAvatar: String,
  groupDescription: String,
  createdBy: { type: ObjectId, ref: 'User' },
  admins: [{ type: ObjectId, ref: 'User' }],
  participants: [{ type: ObjectId, ref: 'User', index: true }],
  pinnedBy: [{ type: ObjectId, ref: 'User' }],
  mutedBy: [{
    userId: { type: ObjectId, ref: 'User' },
    until: Date
  }],
  lastMessage: {
    content: String,
    sender: { type: ObjectId, ref: 'User' },
    createdAt: Date,
    type: String
  },
  unreadCounts: {
    type: Map,
    of: Number,
    default: {}
  },
  updatedAt: { type: Date, default: Date.now, index: true }
}
```

---

## 6. Socket.IO Event Contract

| Event Name | Direction | Payload | Description |
| :--- | :---: | :--- | :--- |
| `authenticate` | C ➔ S | `{ token }` | Authenticate socket connection |
| `presence:subscribe` | C ➔ S | `{ userIds: [] }` | Subscribe to presence of specific users |
| `presence:update` | S ➔ C | `{ userId, status, lastSeen }` | Broadcast user online/offline status |
| `typing:start` | C ➔ S | `{ conversationId }` | User started typing |
| `typing:stop` | C ➔ S | `{ conversationId }` | User stopped typing |
| `typing:status` | S ➔ C | `{ conversationId, userId, isTyping }`| Notify active participants |
| `message:send` | C ➔ S | `{ conversationId, type, content, media, replyTo, quizMetadata }` | Dispatch new message |
| `message:new` | S ➔ C | `MessageObject` | Deliver message to recipients |
| `message:read` | C ➔ S | `{ conversationId, messageIds: [] }` | Mark messages as read |
| `message:status_update`| S ➔ C | `{ messageId, status: 'delivered'|'read', readBy }` | Update tick status |
| `message:reaction` | C ➔ S | `{ messageId, emoji }` | Add or toggle reaction |
| `message:reaction_update`| S ➔ C | `{ messageId, reactions: [] }` | Broadcast reaction changes |
| `message:edit` | C ➔ S | `{ messageId, newContent }` | Edit message content |
| `message:delete` | C ➔ S | `{ messageId, deleteType }` | Revoke or soft-delete message |

---

## 7. Step-by-Step Execution Plan

1. **Step 1: Socket.IO Server & Gateway Integration**
   - Install `socket.io` in `message-service`.
   - Setup socket server attached to HTTP server with JWT authentication.
   - Configure Gateway WebSocket proxying and event propagation.
2. **Step 2: Enhanced Schema & REST/Socket Endpoints**
   - Update `Message.model.js` and `Conversation.model.js` with reactions, quotes, delivery status, and media attributes.
   - Implement handlers for typing, presence, reactions, edits, and reads.
3. **Step 3: Desktop Frontend (`desktop-web`) Real-Time Upgrade**
   - Integrate Socket.IO client in `apps/desktop-web`.
   - Build rich message bubble component with emoji reactions, quotes, delivery ticks, and voice/image rendering.
   - Add typing indicators, active presence header, and in-chat search.
4. **Step 4: Mobile-Web Frontend (`mobile-web`) Messaging Integration**
   - Create responsive mobile messaging screens (`/messages` list and `/messages/:id` chat view).
   - Add bottom bar message tab with badge counter.
   - Implement swipe-to-reply, touch-friendly reaction bar, and safe-area aware layout.
5. **Step 5: Quiz Platform Integrations**
   - Add "Share to Chat" button on Quiz Detail and Quiz Result screens.
   - Render interactive Quiz Preview cards directly in chat with one-tap start.
6. **Step 6: End-to-End Verification & Polish**
   - Test simultaneous multi-tab / multi-user communication, presence toggling, delivery ticks, and reaction rendering.
