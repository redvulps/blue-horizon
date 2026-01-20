/**
 * Application-wide timing constants
 * All values are in milliseconds
 */

// Chat polling intervals
export const CHAT_CONVERSATIONS_POLL_INTERVAL = 30 * 1000; // 30 seconds
export const CHAT_CONVERSATIONS_STALE_TIME = 30 * 1000;
export const CHAT_MESSAGES_POLL_INTERVAL = 10 * 1000; // 10 seconds
export const CHAT_MESSAGES_STALE_TIME = 10 * 1000;
export const CHAT_UNREAD_COUNT_POLL_INTERVAL = 30 * 1000; // 30 seconds
export const CHAT_UNREAD_COUNT_STALE_TIME = 15 * 1000;

// Conversation details (less frequent, mostly static)
export const CHAT_CONVO_DETAILS_STALE_TIME = 60 * 1000; // 1 minute

// Timeline polling (if enabled in future)
export const TIMELINE_STALE_TIME = 5 * 60 * 1000; // 5 minutes

// Notifications
export const NOTIFICATIONS_STALE_TIME = 60 * 1000; // 1 minute

// Profile data
export const PROFILE_STALE_TIME = 5 * 60 * 1000; // 5 minutes

// Search debounce
export const SEARCH_DEBOUNCE_MS = 300;
