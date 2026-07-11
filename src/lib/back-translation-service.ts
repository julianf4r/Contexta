import { invoke } from '@tauri-apps/api/core';
import { LANGUAGES, type Language } from '../domain/translation';

interface BackTranslationOptions {
  apiKey: string;
  text: string;
  translatedLanguage: Language;
  targetLanguage: Language;
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
  targetLanguage,
}: BackTranslationOptions) {
  const translatedText = await invoke<string>('back_translate', {
    apiKey,
    text,
    sourceLanguage: toGoogleLanguageCode(translatedLanguage),
    targetLanguage: toGoogleLanguageCode(targetLanguage),
  });

  const parsed = new DOMParser().parseFromString(translatedText, 'text/html');
  return parsed.documentElement.textContent || translatedText;
}

export function resolveBackTranslationTargetLanguage(originalLanguage: Language, configuredCode: string) {
  if (configuredCode === 'source') return originalLanguage;
  return LANGUAGES.find(language => language.code === configuredCode) || originalLanguage;
}

export function formatBackTranslationError(error: unknown) {
  const message = String(error);
  return message.startsWith('HTTP ') ? `回译请求失败：${message}` : `无法完成回译：${message}`;
}
