<template>
  <AnimatedAppear tag="section" variant="content" rhythm="shell" class-name="podcast-page">
    <div class="podcast-shell">
      <section class="podcast-main">
        <AnimatedAppear tag="section" variant="content" rhythm="body" class-name="main-card hero-card">
          <div class="hero-top">
            <div>
              <AnimatedAppear tag="h2" variant="title" rhythm="title" class-name="title">电台订阅列表</AnimatedAppear>
            </div>
          </div>

          <div class="card-head card-head--wrap">
            <div class="hero-actions">
              <button class="pill-btn button-surface" type="button" @click="emit('back')">返回</button>
            </div>
            <div class="section-summary">
              <span>共 {{ items.length }} 个已订阅电台</span>
            </div>
          </div>

          <div v-if="items.length" class="grouped-sections">
            <div class="content-grid">
              <AnimatedAppear
                v-for="(item, idx) in items"
                :key="item.id || item.voiceListId || item.program?.id || `${titleOf(item)}-${idx}`"
                tag="button"
                variant="media"
                rhythm="list"
                :index="idx"
                class-name="content-card interactive-media-trigger"
                type="button"
                @click="openDetail(item)"
              >
                <InteractiveCoverMedia
                  :src="coverOf(item)"
                  :alt="titleOf(item)"
                  :index="idx"
                  shell-class="content-media-shell"
                  motion-class="content-cover-motion-shell"
                  image-class="content-cover"
                />
                <div class="content-meta">
                  <div class="content-title-row">
                    <strong>{{ titleOf(item) }}</strong>
                  </div>
                  <span v-if="subtitleOf(item)">{{ subtitleOf(item) }}</span>
                </div>
              </AnimatedAppear>
            </div>
          </div>
          <p v-else class="empty-box">暂无已订阅电台</p>
        </AnimatedAppear>
      </section>
    </div>
  </AnimatedAppear>
</template>

<script setup lang="ts">
import AnimatedAppear from './AnimatedAppear.vue';
import InteractiveCoverMedia from './InteractiveCoverMedia.vue';

const props = defineProps<{ items: any[] }>();
const emit = defineEmits<{
  (e: 'back'): void;
  (e: 'open-detail', item: any): void;
}>();

const fallbackCover = 'data:image/svg+xml;utf8,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200"><rect width="200" height="200" rx="32" fill="#e2e8f0"/><circle cx="100" cy="84" r="40" fill="#cbd5e1"/><rect x="46" y="136" width="108" height="20" rx="10" fill="#cbd5e1"/></svg>`);

function coverOf(item: any) { return item?.coverUrl || item?.picUrl || item?.imgUrl || item?.program?.coverUrl || item?.program?.blurCoverUrl || item?.program?.radio?.picUrl || item?.program?.mainSong?.al?.picUrl || item?.radio?.picUrl || item?.mainSong?.al?.picUrl || fallbackCover; }
function titleOf(item: any) { return item?.name || item?.title || item?.program?.name || item?.programName || '播客节目'; }
function subtitleOf(item: any) { return item?.subtitle || item?.description || item?.briefDesc || item?.creator?.nickname || item?.program?.radio?.name || item?.radio?.name || ''; }
function openDetail(item: any) { if (item) emit('open-detail', item); }
</script>

<style scoped>
.podcast-page,.podcast-main{display:grid;gap:var(--space-4)}
.main-card{display:grid;gap:var(--space-4);padding:var(--space-4);border-radius:var(--radius-xl,24px)}
.hero-top,.card-head{display:flex;align-items:flex-start;justify-content:space-between;gap:var(--space-3)}
.card-head--wrap{flex-wrap:wrap}.content-meta span{color:var(--text-sub)}
.title{margin:0;font-size:24px;font-weight:800}
.hero-actions{display:flex;flex-wrap:wrap;gap:var(--space-2)}
.section-summary{display:inline-flex;align-items:center;min-height:40px;color:var(--text-sub);font-size:var(--text-body-sm)}
.grouped-sections{display:grid;gap:var(--space-6)}
.pill-btn,.content-card{border:1px solid color-mix(in srgb, var(--border) 78%, transparent);transition:transform 180ms ease-out,border-color 180ms ease-out,box-shadow 180ms ease-out,background 180ms ease-out}
.pill-btn{height:40px;padding:0 var(--space-3);border-radius:999px;background:var(--bg-muted)}
.content-card:hover,.pill-btn:hover{transform:translateY(-1px);border-color:color-mix(in srgb, var(--accent) 24%, var(--border));box-shadow:0 12px 24px rgba(15,23,42,.08)}
.content-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:var(--space-4)}
.content-card{display:grid;gap:var(--space-3);padding:var(--space-2);border-radius:var(--radius-xl,24px);text-align:left}
:deep(.content-media-shell){width:100%;aspect-ratio:1/1;border-radius:20px}:deep(.content-cover-motion-shell){width:100%;height:100%;border-radius:20px;overflow:hidden}:deep(.content-cover){width:100%;height:100%;object-fit:cover}
.content-meta{display:grid;gap:var(--space-1)}
.content-title-row{display:flex;align-items:flex-start;justify-content:space-between;gap:var(--space-2)}
.content-title-row strong{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;font-size:16px;font-weight:600;line-height:1.5}
.content-meta span{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.empty-box{margin:0;padding:var(--space-5);border-radius:var(--radius-lg,18px);background:var(--bg-muted);color:var(--text-sub)}
@media (max-width:767px){.main-card{padding:var(--space-3)}.hero-top,.card-head{flex-direction:column}.content-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
</style>
