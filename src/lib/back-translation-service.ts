import { invoke } from '@tauri-apps/api/core';
import { LANGUAGES, type Language } from '../domain/translation';

interface BackTranslationOptions {
  apiKey: string;
  text: string;
  translatedLanguage: Language;
  targetLanguage: Language;
  logger: {
    addLog: (type: 'request' | 'response' | 'error', content: any, curl?: string) => void;
  };
}

const GOOGLE_TRANSLATE_API_URL = 'https://translation.googleapis.com/language/translate/v2';

function toGoogleLanguageCode(language: Language) {
  switch (language.code) {
    case 'zh-Hans':
      return 'zh-CN';
    case 'zh-Hant':
      return 'zh-TW';
    case 'en-US':
    case 'en-GB':
      return 'en';
    default:
      return language.code;
  }
}

export async function executeBackTranslation({
  apiKey,
  text,
  translatedLanguage,
  targetLanguage,
  logger,
}: BackTranslationOptions) {
  const sourceLanguage = toGoogleLanguageCode(translatedLanguage);
  const targetLanguageCode = toGoogleLanguageCode(targetLanguage);
  const payload = {
    q: text,
    source: sourceLanguage,
    target: targetLanguageCode,
    format: 'text',
  };
  const maskedKey = apiKey ? `${apiKey.slice(0, 6)}...${apiKey.slice(-4)}` : 'YOUR_API_KEY';
  const curl = `curl "${GOOGLE_TRANSLATE_API_URL}" \\
  -H "Content-Type: application/json" \\
  -H "X-goog-api-key: ${maskedKey}" \\
  -d '${JSON.stringify(payload, null, 2)}'`;

  logger.addLog('request', {
    operation: 'back-translation',
    provider: 'Google Cloud Translation API v2',
    ...payload,
  }, curl);

  try {
    const translatedText = await invoke<string>('back_translate', {
      apiKey,
      text,
      sourceLanguage,
      targetLanguage: targetLanguageCode,
    });

    const parsed = new DOMParser().parseFromString(translatedText, 'text/html');
    const decodedText = parsed.documentElement.textContent || translatedText;
    logger.addLog('response', {
      operation: 'back-translation',
      translatedText: decodedText,
    });
    return decodedText;
  } catch (error) {
    logger.addLog('error', `回译请求错误：${String(error)}`);
    throw error;
  }
}

export function resolveBackTranslationTargetLanguage(originalLanguage: Language, configuredCode: string) {
  if (configuredCode === 'source') return originalLanguage;
  return LANGUAGES.find(language => language.code === configuredCode) || originalLanguage;
}

export function formatBackTranslationError(error: unknown) {
  const message = String(error);
  return message.startsWith('HTTP ') ? `回译请求失败：${message}` : `无法完成回译：${message}`;
}
