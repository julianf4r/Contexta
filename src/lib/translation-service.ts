import { invoke } from '@tauri-apps/api/core';
interface Message {
  role: string;
  content: string;
}

export interface TranslationPayload {
  model: string;
  messages: Message[];
  stream: boolean;
}

export interface TranslationChunkEvent {
  request_id: string;
  chunk: string;
}

type LogType = 'request' | 'response' | 'error';

interface Logger {
  addLog: (type: LogType, content: any, curl?: string) => void;
}

interface ExecuteTranslationRequestOptions {
  apiAddress: string;
  apiKey: string;
  payload: TranslationPayload;
  logger: Logger;
  logType?: string;
  onStreamStart?: (requestId: string) => void;
}

export function generateCurl(apiBaseUrl: string, apiKey: string, body: TranslationPayload) {
  const fullUrl = `${apiBaseUrl.replace(/\/$/, '')}/chat/completions`;
  const maskedKey = apiKey ? `${apiKey.slice(0, 6)}...${apiKey.slice(-4)}` : 'YOUR_API_KEY';

  return `curl "${fullUrl}" \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer ${maskedKey}" \\
  -d '${JSON.stringify(body, null, 2)}'`;
}

export async function executeTranslationRequest({
  apiAddress,
  apiKey,
  payload,
  logger,
  logType,
  onStreamStart,
}: ExecuteTranslationRequestOptions) {
  const requestId = crypto.randomUUID();
  const requestLog = logType ? { type: logType, ...payload } : payload;

  logger.addLog('request', requestLog, generateCurl(apiAddress, apiKey, payload));

  try {
    if (payload.stream) onStreamStart?.(requestId);

    const response = await invoke<string>('translate', {
      apiAddress,
      apiKey,
      payload,
      requestId,
    });

    logger.addLog('response', payload.stream ? createStreamingResponseLog(response) : safeParseJson(response) ?? response);
    return response;
  } catch (error) {
    logger.addLog('error', String(error));
    throw error;
  }
}

export function safeParseJson(value: string) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

export function extractAssistantContent(response: string) {
  const parsed = safeParseJson(response);
  if (parsed && typeof parsed === 'object') {
    return (parsed as any).choices?.[0]?.message?.content || response;
  }
  return response;
}

export function extractStreamedAssistantContent(response: string) {
  return response
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.startsWith('data: ') && line !== 'data: [DONE]')
    .map((line) => safeParseJson(line.slice(6)) as any)
    .filter(Boolean)
    .map((parsed) => parsed.choices?.[0]?.delta?.content || '')
    .join('');
}

function createStreamingResponseLog(response: string) {
  const lines = response.split(/\r?\n/).map((line) => line.trim());
  const eventCount = lines.filter((line) => line.startsWith('data: ') && line !== 'data: [DONE]').length;

  return {
    streamed: true,
    content: extractStreamedAssistantContent(response),
    rawLength: response.length,
    eventCount,
  };
}
