import { defineStore } from 'pinia';
import { useLocalStorage } from '@vueuse/core';
import type { ChatMessage, ChatSession, Participant } from '../domain/translation';

function formatTimestamp() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;
}

export const useConversationStore = defineStore('conversation', () => {
  const chatSessions = useLocalStorage<ChatSession[]>('chat-sessions-v1', []);
  const activeSessionId = useLocalStorage<string | null>('active-session-id-v1', null);

  const createSession = (me: Participant, partner: Participant) => {
    const id = crypto.randomUUID();
    const timestamp = formatTimestamp();

    const newSession: ChatSession = {
      id,
      title: `${partner.name} 的对话`,
      me,
      partner,
      messages: [],
      lastActivity: timestamp,
    };

    chatSessions.value.unshift(newSession);
    activeSessionId.value = id;
    return id;
  };

  const deleteSession = (id: string) => {
    chatSessions.value = chatSessions.value.filter((session) => session.id !== id);
    if (activeSessionId.value === id) {
      activeSessionId.value = chatSessions.value[0]?.id || null;
    }
  };

  const addMessageToSession = (sessionId: string, sender: 'me' | 'partner', original: string, translated = '') => {
    const session = chatSessions.value.find((item) => item.id === sessionId);
    if (!session) return null;

    const timestamp = formatTimestamp();
    const newMessage: ChatMessage = {
      id: crypto.randomUUID(),
      sender,
      original,
      translated,
      timestamp,
    };

    session.messages.push(newMessage);
    session.lastActivity = timestamp;

    const index = chatSessions.value.findIndex((item) => item.id === sessionId);
    if (index > 0) {
      const [current] = chatSessions.value.splice(index, 1);
      chatSessions.value.unshift(current);
    }

    return newMessage.id;
  };

  const updateChatMessage = (sessionId: string, messageId: string, updates: Partial<ChatMessage>) => {
    const session = chatSessions.value.find((item) => item.id === sessionId);
    const message = session?.messages.find((item) => item.id === messageId);
    if (message) Object.assign(message, updates);
  };

  const deleteChatMessage = (sessionId: string, messageId: string) => {
    const session = chatSessions.value.find((item) => item.id === sessionId);
    if (session) {
      session.messages = session.messages.filter((item) => item.id !== messageId);
    }
  };

  return {
    chatSessions,
    activeSessionId,
    createSession,
    deleteSession,
    addMessageToSession,
    updateChatMessage,
    deleteChatMessage,
  };
});
