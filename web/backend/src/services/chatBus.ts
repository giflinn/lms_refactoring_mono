// Process-local event bus that decouples REST routes (which produce events
// during request handling) from socket.io / FCM consumers (which are wired in
// separately). Routes never import the socket server directly, so the
// realtime layer can be bootstrapped or replaced without touching feature
// code.
//
// Events:
//   message:new    → { threadId, message, recipientUserIds, autoReadByUserIds }
//                    `message` is the serialized chat_messages row.
//                    `recipientUserIds` are users who should hear about this
//                    delivery. `autoReadByUserIds` is the subset that was
//                    looking at the thread at delivery time and has already
//                    been marked read by the server.
//   message:read   → { threadId, userId, lastReadAt }
//   presence:update→ { userId, online, lastSeenAt }
//   settings:update→ { keys: string[] }

import { EventEmitter } from "node:events";

export const chatBus = new EventEmitter();
