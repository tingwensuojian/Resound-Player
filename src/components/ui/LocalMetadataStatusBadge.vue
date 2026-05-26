<template>
  <span
    v-if="statusInfo"
    class="local-meta-badge"
    :class="[`status-${statusInfo.status}`, compact ? 'compact' : '']"
    :title="message || statusInfo.message"
  >
    {{ statusInfo.label }}
  </span>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { LocalMetadataStatus, LocalMetadataStatusResult } from '../../stores/localMusic'

const props = defineProps<{
  status?: LocalMetadataStatus | ''
  result?: LocalMetadataStatusResult | null
  compact?: boolean
  message?: string
}>()

const STATUS_LABELS: Record<LocalMetadataStatus, { label: string; message: string }> = {
  unmatched: { label: '未匹配', message: '当前未匹配云端信息' },
  matched_not_written: { label: '已匹配', message: '已匹配云端信息，尚未写入文件' },
  written: { label: '已写入文件', message: '缺失标签已写入文件' },
  written_duplicate: { label: '已写入文件', message: '文件已按相同内容补全过' },
  revertible: { label: '可回滚', message: '缺失标签已写入文件，可安全回滚' },
  partially_reverted: { label: '部分回滚', message: '标签已部分回滚，部分字段因文件变化被保留' },
  reverted: { label: '已回滚', message: '本次补全写入的标签已回滚' },
  conflicted: { label: '文件已变更', message: '文件标签已被后续修改，当前不可自动回滚' },
  no_missing_fields: { label: '无需补全', message: '文件标签已完整，无需补全' },
}

const statusInfo = computed(() => {
  const key = props.result?.status || props.status
  if (!key) return null
  return STATUS_LABELS[key]
})
</script>

<style scoped>
.local-meta-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 20px;
  padding: 0 8px;
  border-radius: 999px;
  border: 1px solid transparent;
  font-size: 11px;
  font-weight: 700;
  line-height: 1;
  letter-spacing: 0.01em;
  white-space: nowrap;
}
.local-meta-badge.compact {
  min-height: 18px;
  padding: 0 6px;
  font-size: 10px;
}
.status-unmatched {
  color: var(--text-soft);
  border-color: var(--border-soft, rgba(255,255,255,0.12));
  background: color-mix(in srgb, var(--bg-muted, rgba(255,255,255,0.05)) 86%, transparent);
}
.status-matched_not_written {
  color: #9ec5ff;
  border-color: rgba(110, 168, 255, 0.35);
  background: rgba(80, 130, 255, 0.12);
}
.status-written,
.status-written_duplicate {
  color: #8fd8ae;
  border-color: rgba(79, 188, 124, 0.35);
  background: rgba(42, 150, 90, 0.12);
}
.status-revertible {
  color: #f3c981;
  border-color: rgba(235, 179, 70, 0.38);
  background: rgba(209, 145, 36, 0.12);
}
.status-partially_reverted {
  color: #f7b093;
  border-color: rgba(244, 132, 81, 0.38);
  background: rgba(209, 104, 40, 0.12);
}
.status-reverted {
  color: #c7c7d4;
  border-color: rgba(190, 190, 210, 0.3);
  background: rgba(145, 145, 165, 0.12);
}
.status-conflicted {
  color: #ffb4b4;
  border-color: rgba(255, 112, 112, 0.38);
  background: rgba(190, 62, 62, 0.12);
}
.status-no_missing_fields {
  color: #c8d67d;
  border-color: rgba(180, 198, 88, 0.32);
  background: rgba(116, 138, 29, 0.12);
}
</style>
