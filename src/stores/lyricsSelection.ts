import { defineStore } from 'pinia';
import { ref } from 'vue';

export const useLyricsSelectionStore = defineStore('lyricsSelection', () => {
  const isOpen = ref(false);
  const selectedIndices = ref<Set<number>>(new Set());
  const showTranslation = ref(false);
  const currentTrackId = ref<number | string | null>(null);

  function openSelection(trackId: number | string | null) {
    if (currentTrackId.value !== trackId) {
      selectedIndices.value = new Set();
      showTranslation.value = false;
      currentTrackId.value = trackId;
    }
    isOpen.value = true;
  }

  function closeSelection() {
    isOpen.value = false;
  }

  function toggleLine(idx: number) {
    const set = new Set(selectedIndices.value);
    if (set.has(idx)) set.delete(idx);
    else set.add(idx);
    selectedIndices.value = set;
  }

  function toggleSelectionTranslation() {
    showTranslation.value = !showTranslation.value;
  }

  function getSelectedLines(lines: any[]) {
    return lines.filter((_, i) => selectedIndices.value.has(i));
  }

  return {
    isOpen,
    selectedIndices,
    showTranslation,
    currentTrackId,
    openSelection,
    closeSelection,
    toggleLine,
    toggleSelectionTranslation,
    getSelectedLines,
  };
});