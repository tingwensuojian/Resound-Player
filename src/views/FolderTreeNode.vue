<template>
  <div class="folder-tree-node" :class="{ last: isLast }">
    <div
      class="folder-node"
      :class="{ selected: selected === node.path }"
      :style="{ paddingLeft: depth * 18 + 20 + 'px' }"
      @click="$emit('select', node.path)"
    >
      <!-- 展开/折叠箭头 -->
      <button
        class="folder-toggle"
        v-if="node.children.length"
        @click.stop="$emit('toggle', node.path)"
      >
        <ChevronRight
          class="folder-arrow"
          :class="{ open: !isCollapsed }"
          :size="12"
        />
      </button>
      <span v-else class="folder-toggle folder-toggle-placeholder"></span>

      <!-- 文件夹/文件图标 -->
      <span class="folder-icon-wrap">
        <Folder v-if="node.children.length && isCollapsed" class="folder-icon folder-icon-closed" :size="15" />
        <FolderOpen v-else-if="node.children.length" class="folder-icon folder-icon-open" :size="15" />
        <File v-else class="folder-icon folder-icon-leaf" :size="15" />
      </span>

      <!-- 名称 -->
      <span class="folder-name" :title="node.name">{{ node.name }}</span>

      <!-- 计数 -->
      <span class="folder-count">{{ node.count }}</span>
    </div>

    <!-- 子节点（带展开/折叠动画） -->
    <Transition name="tree-slide">
      <div v-if="node.children.length && !isCollapsed" class="tree-children">
        <FolderTreeNode
          v-for="(child, idx) in node.children"
          :key="child.path"
          :node="child"
          :selected="selected"
          :depth="depth + 1"
          :is-last="idx === node.children.length - 1"
          @select="(p: string) => $emit('select', p)"
          @toggle="(p: string) => $emit('toggle', p)"
        />
      </div>
    </Transition>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { ChevronRight, Folder, FolderOpen, File } from 'lucide-vue-next'
import type { FolderNode } from '../stores/localMusic'
import { useLocalMusicStore } from '../stores/localMusic'
const localMusicStore = useLocalMusicStore()

const props = defineProps<{
  node: FolderNode
  selected: string
  depth: number
  isLast?: boolean
}>()

defineEmits<{
  select: [path: string]
  toggle: [path: string]
}>()

const isCollapsed = computed(() => localMusicStore.state.collapsedFolders.has(props.node.path))
</script>

<style scoped>
.folder-tree-node {
  position: relative;
}

/* ── 缩进引导线 ── */
/* 垂直延续线：非最后一个子节点向下延伸 */
.folder-tree-node:not(.last) > .folder-node::before {
  content: '';
  position: absolute;
  left: calc(var(--node-depth, 0) * 18px + 12px);
  top: 50%;
  bottom: -100%;
  width: 1px;
  background: var(--border-soft);
  pointer-events: none;
}

/* 水平连接线：从引导线到节点 */
.folder-node::after {
  content: '';
  position: absolute;
  left: calc(var(--node-depth, 0) * 18px + 12px);
  top: 50%;
  width: 8px;
  height: 1px;
  background: var(--border-soft);
  pointer-events: none;
  transform: translateY(-0.5px);
}

/* ── 节点行 ── */
.folder-node {
  --node-depth: v-bind(depth);
  position: relative;
  display: flex;
  align-items: center;
  gap: var(--space-1);
  padding: var(--space-1) var(--space-2);
  border-radius: var(--radius-sm);
  cursor: pointer;
  font-size: var(--text-body-sm);
  user-select: none;
  transition: background 0.15s, box-shadow 0.15s;
  min-height: 30px;
  margin: 1px 0;
}
.folder-node:hover {
  background: var(--bg-muted);
}

/* ── 选中增强样式 ── */
.folder-node.selected {
  background: var(--accent-soft);
  box-shadow: inset 2px 0 0 var(--accent);
}
.folder-node.selected .folder-name {
  color: var(--accent);
  font-weight: 600;
}
.folder-node.selected .folder-count {
  color: var(--accent);
  opacity: 0.7;
}

/* ── 箭头 ── */
.folder-toggle {
  background: none;
  border: none;
  cursor: pointer;
  padding: 0;
  width: 14px;
  height: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  position: relative;
  z-index: 1;
}
.folder-toggle-placeholder {
  width: 14px;
  flex-shrink: 0;
}
.folder-arrow {
  color: var(--text-soft);
  transition: transform 0.2s ease;
}
.folder-arrow.open {
  transform: rotate(90deg);
}

/* ── 图标 ── */
.folder-icon-wrap {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  position: relative;
  z-index: 1;
}
.folder-icon-closed {
  color: var(--accent-blue);
}
.folder-icon-open {
  color: var(--accent-orange);
}
.folder-icon-leaf {
  color: var(--text-soft);
}

/* ── 名称 ── */
.folder-name {
  color: var(--text-main);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
  min-width: 0;
  position: relative;
  z-index: 1;
}

/* ── 计数 ── */
.folder-count {
  font-size: var(--text-label-xs);
  color: var(--text-soft);
  flex-shrink: 0;
  position: relative;
  z-index: 1;
}

/* ── 展开/折叠动画 ── */
.tree-slide-enter-active {
  transition: all 0.28s ease-out;
  overflow: hidden;
}
.tree-slide-leave-active {
  transition: all 0.2s ease-in;
  overflow: hidden;
}
.tree-slide-enter-from,
.tree-slide-leave-to {
  max-height: 0;
  opacity: 0;
  transform: translateY(-6px);
}
.tree-slide-enter-to,
.tree-slide-leave-from {
  max-height: 2000px;
  opacity: 1;
  transform: translateY(0);
}
</style>