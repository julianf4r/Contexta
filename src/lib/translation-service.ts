import { invoke } from '@tauri-apps/api/core';
import type { ApiProfile } from '../domain/translation';

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

export interface EvaluationSuggestion {
  id: number;
  text: string;
  importance: number;
}

export interface EvaluationResult {
  score: number;
  analysis: string;
  suggestions: EvaluationSuggestion[];
}

export interface ModelConfig {
  apiBaseUrl: string;
  apiKey: string;
  modelName: string;
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

const FALLBACK_EVALUATION_RESULT: EvaluationResult = {
  score: 0,
  analysis: '无法解析审计结果，请查看日志',
  suggestions: [],
};

export function resolveModelConfig(
  primary: ModelConfig,
  profiles: ApiProfile[],
  profileId: string | null,
): ModelConfig {
  if (!profileId) return primary;

  const profile = profiles.find((item) => item.id === profileId);
  if (!profile) return primary;

  return {
    apiBaseUrl: profile.apiBaseUrl,
    apiKey: profile.apiKey,
    modelName: profile.modelName,
  };
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

    logger.addLog('response', payload.stream ? response : safeParseJson(response) ?? response);
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

export function tryParseEvaluationResult(raw?: string) {
  if (!raw) {
    return {
      ok: false as const,
      error: 'Evaluation result is empty',
      result: FALLBACK_EVALUATION_RESULT,
    };
  }

  try {
    let cleanStr = raw.trim();
    if (cleanStr.startsWith('```')) {
      cleanStr = cleanStr.replace(/^```[a-zA-Z]*\n?/, '').replace(/\n?```$/, '').trim();
    }

    const parsed = JSON.parse(cleanStr);
    return {
      ok: true as const,
      result: {
        score: Number(parsed.score) || 0,
        analysis: typeof parsed.analysis === 'string' ? parsed.analysis : '',
        suggestions: Array.isArray(parsed.suggestions) ? parsed.suggestions : [],
      } satisfies EvaluationResult,
    };
  } catch (error) {
    return {
      ok: false as const,
      error: `Failed to parse evaluation JSON: ${String(error)}`,
      result: FALLBACK_EVALUATION_RESULT,
    };
  }
}
