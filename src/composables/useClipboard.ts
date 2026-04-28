import { ref } from 'vue';

const activeCopyId = ref<string | null>(null);

export function useClipboard() {
  const copyWithFeedback = async (text: string, id: string) => {
    try {
      await navigator.clipboard.writeText(text);
      activeCopyId.value = id;
      setTimeout(() => {
        if (activeCopyId.value === id) {
          activeCopyId.value = null;
        }
      }, 2000);
    } catch (err) {
      console.error('Failed to copy text: ', err);
    }
  };

  return { activeCopyId, copyWithFeedback };
}
