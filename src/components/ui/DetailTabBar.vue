<template>
  <AnimatedAppear
    tag="div"
    variant="content"
    rhythm="body"
    class-name="playlist-tabs"
    role="tablist"
    :aria-label="ariaLabel"
  >
    <AnimatedAppear
      v-for="tab in tabs"
      :key="tab.key"
      tag="button"
      variant="control"
      rhythm="actions"
      class-name="playlist-tab"
      :class="{ active: modelValue === tab.key }"
      type="button"
      @click="$emit('update:modelValue', tab.key)"
    >
      {{ tab.label }}
    </AnimatedAppear>

    <div v-if="showSearch" class="tab-search-wrap" @click.stop>
      <input
        :value="searchQuery"
        class="tab-search-input"
        type="text"
        placeholder="模糊搜索"
        @input="$emit('update:searchQuery', ($event.target as HTMLInputElement).value)"
        @keydown.esc="$emit('update:searchQuery', '')"
      />
      <button
        v-if="searchQuery"
        class="tab-search-clear"
        type="button"
        @click="$emit('update:searchQuery', '')"
      >
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          <path d="M11 3L3 11M3 3l8 8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
        </svg>
      </button>
    </div>
  </AnimatedAppear>
</template>

<script setup lang="ts">
import AnimatedAppear from '../AnimatedAppear.vue';

defineProps<{
  modelValue: string;
  tabs: Array<{ key: string; label: string }>;
  ariaLabel: string;
  searchQuery?: string;
  showSearch?: boolean;
}>();

defineEmits<{
  (e: 'update:modelValue', key: string): void;
  (e: 'update:searchQuery', query: string): void;
}>();
</script>

<style scoped>
.playlist-tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin: 0;
  align-items: center;
  position: relative;
}

.playlist-tab {
  min-width: 96px;
  height: 38px;
  padding: 0 16px;
  border-radius: 999px;
  border: 1px solid var(--border);
  background: color-mix(in srgb, var(--bg-surface) 88%, transparent);
  color: var(--text-sub);
  cursor: pointer;
  transition: transform .18s ease, background .18s ease, border-color .18s ease, color .18s ease, box-shadow .18s ease;
}

.playlist-tab:hover {
  transform: translateY(-1px);
  background: var(--button-surface-hover-bg);
  border-color: var(--button-surface-hover-border);
}

.playlist-tab.active {
  background: linear-gradient(160deg, color-mix(in srgb, var(--accent) 90%, #fff), color-mix(in srgb, var(--accent) 68%, #000));
  color: #fff;
  border-color: color-mix(in srgb, var(--accent) 70%, var(--border));
}

/* 搜索框 — 靠右对齐 */
.tab-search-wrap {
  position: relative;
  margin-left: auto;
  display: flex;
  align-items: center;
}

.tab-search-input {
  height: 34px;
  width: 200px;
  padding: 0 32px 0 14px;
  border-radius: 999px;
  border: 1px solid var(--border);
  background: color-mix(in srgb, var(--bg-surface) 88%, transparent);
  color: var(--text-main);
  font-size: 13px;
  outline: none;
  transition: border-color 0.18s ease, box-shadow 0.18s ease;
}

.tab-search-input::placeholder {
  color: var(--text-soft);
}

.tab-search-input:hover {
  border-color: var(--button-surface-hover-border);
}

.tab-search-input:focus {
  border-color: color-mix(in srgb, var(--accent) 50%, var(--border));
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 10%, transparent);
}

.tab-search-clear {
  position: absolute;
  right: 6px;
  top: 50%;
  transform: translateY(-50%);
  width: 22px;
  height: 22px;
  border: 0;
  border-radius: 50%;
  background: color-mix(in srgb, var(--text-sub) 16%, transparent);
  color: var(--text-sub);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.15s ease, color 0.15s ease;
}

.tab-search-clear:hover {
  background: color-mix(in srgb, var(--text-sub) 30%, transparent);
  color: var(--text-main);
}
</style>