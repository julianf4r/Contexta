import { invoke } from '@tauri-apps/api/core';
import type { Language } from '../domain/translation';

interface BackTranslationOptions {
  apiKey: string;
  text: string;
  translatedLanguage: Language;
  originalLanguage: Language;
}

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
  originalLanguage,
}: BackTranslationOptions) {
  const translatedText = await invoke<string>('back_translate', {
    apiKey,
    text,
    sourceLanguage: toGoogleLanguageCode(translatedLanguage),
    targetLanguage: toGoogleLanguageCode(originalLanguage),
  });

  const parsed = new DOMParser().parseFromString(translatedText, 'text/html');
  return parsed.documentElement.textContent || translatedText;
}

export function formatBackTranslationError(error: unknown) {
  const message = String(error);
  return message.startsWith('HTTP ') ? `回译请求失败：${message}` : `无法完成回译：${message}`;
}
