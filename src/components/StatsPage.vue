<template>
  <AnimatedAppear tag="section" variant="content" rhythm="shell" class-name="stats-page">
    <!-- Header -->
    <div class="stats-header">
      <div>
        <h2 class="stats-title">听歌统计</h2>
        <p class="stats-subtitle">深入了解您的音乐品味与收听习惯</p>
      </div>
      <div class="time-segmented ui-safe-group">
        <button
          v-for="t in timeRanges"
          :key="t.key"
          class="segmented-btn"
          :class="{ active: activeRange === t.key }"
          @click="switchRange(t.key)"
        >{{ t.label }}</button>
      </div>
    </div>

    <!-- Daily Listening Bar Chart -->
    <div class="stats-card chart-card">
      <div class="chart-card__header">
        <h3 class="chart-card__title">{{ chartTitle }}</h3>
        <div class="chart-legend">
          <span class="legend-dot"></span>
          <span class="legend-label">{{ chartLegend }}</span>
        </div>
      </div>
      <div class="chart-bars">
        <div class="chart-grid-lines">
          <div class="grid-line"></div>
          <div class="grid-line"></div>
          <div class="grid-line"></div>
          <div class="grid-line"></div>
        </div>
        <div class="bar-column" v-for="day in weekDays" :key="day.label">
          <div
            class="bar-fill"
            :class="{ 'bar-fill--peak': day.isPeak }"
            :style="{ height: `${Math.max(day.pct, 4)}%` }"
          ></div>
          <span
            class="bar-label"
            :class="{ 'bar-label--active': day.isPeak }"
          >{{ day.label }}</span>
        </div>
      </div>
      <div v-if="!weekDays.length" class="chart-empty">暂无听歌记录</div>
    </div>

    <!-- Listening Heatmap -->
    <div class="stats-card heatmap-card">
      <div class="chart-card__header">
        <h3 class="chart-card__title">听歌热力图</h3>
        <div class="heatmap-legend-row">
          <span class="heatmap-legend-label">少</span>
          <span class="heatmap-cell-swatch" style="background: var(--bg-muted);"></span>
          <span class="heatmap-cell-swatch" style="background: color-mix(in srgb, var(--accent) 22%, transparent);"></span>
          <span class="heatmap-cell-swatch" style="background: color-mix(in srgb, var(--accent) 45%, transparent);"></span>
          <span class="heatmap-cell-swatch" style="background: color-mix(in srgb, var(--accent) 72%, transparent);"></span>
          <span class="heatmap-cell-swatch" style="background: var(--accent);"></span>
          <span class="heatmap-legend-label">多</span>
        </div>
      </div>
      <div class="heatmap-container">
        <div class="heatmap-y-labels">
          <span></span><span>周一</span><span></span><span>周三</span><span></span><span>周五</span><span></span>
        </div>
        <div class="heatmap-grid">
          <div
            v-for="(cell, idx) in heatmapCells"
            :key="idx"
            class="heatmap-cell"
            :class="'heatmap-cell--l' + cell.level"
            @click="openHeatmapPopup($event, cell)"
          ></div>
        </div>
      </div>
      <div class="heatmap-month-labels">
        <span v-for="m in monthLabels" :key="m.idx">{{ m.label }}</span>
      </div>

      <!-- Heatmap Popup -->
      <div v-if="heatmapPopup.visible" class="heatmap-popup" :style="heatmapPopup.style" @click.stop>
        <div class="heatmap-popup__date">{{ heatmapPopup.date }}</div>
        <div class="heatmap-popup__plays" v-if="heatmapPopup.value > 0">播放 {{ heatmapPopup.value }} 分钟</div>
        <div class="heatmap-popup__plays" v-else>无收听记录</div>
        <template v-if="heatmapPopup.isToday && todaySongs.length">
          <div class="heatmap-popup__divider"></div>
          <div class="heatmap-popup__songs-title">今日歌曲</div>
          <div class="heatmap-popup__songs">
            <div v-for="(s, i) in todaySongs.slice(0, 5)" :key="s.id || i" class="heatmap-popup__song">
              <span class="heatmap-popup__song-idx">{{ i + 1 }}.</span>
              <span class="heatmap-popup__song-name">{{ s.name }}</span>
              <span class="heatmap-popup__song-artist">- {{ s.artistName }}</span>
            </div>
          </div>
        </template>
      </div>
    </div>

    <!-- Stat Cards: Most Played / Most Active / Latest Night -->
    <div class="stat-cards">
      <div class="stats-card stat-card" @click="playMostPlayed">
        <div class="stat-icon stat-icon--trophy">
          <Trophy :size="24" />
        </div>
        <div class="stat-card__content">
          <p class="stat-card__label">播放最多的歌曲</p>
          <template v-if="mostPlayedSong">
            <p class="stat-card__name">{{ mostPlayedSong.name }}</p>
            <p class="stat-card__sub">
              <button v-if="mostPlayedSong.artistId" type="button" class="artist-inline-btn" @click.stop="emit('open-artist', { id: mostPlayedSong.artistId, name: mostPlayedSong.artist })">{{ mostPlayedSong.artist }}</button>
              <template v-else>{{ mostPlayedSong.artist }}</template>
              <template v-if="mostPlayedSong.playCount"> · {{ mostPlayedSong.playCount }} 次</template>
            </p>
          </template>
          <p v-else class="stat-card__empty">暂无数据</p>
        </div>
      </div>
      <div class="stats-card stat-card">
        <div class="stat-icon stat-icon--fire">
          <Flame :size="24" />
        </div>
        <div class="stat-card__content">
          <p class="stat-card__label">最活跃的一天</p>
          <template v-if="mostActiveDay">
            <p class="stat-card__name">{{ mostActiveDay.date }}</p>
            <p class="stat-card__sub">{{ mostActiveDay.duration }} 分钟</p>
          </template>
          <p v-else class="stat-card__empty">暂无数据</p>
        </div>
      </div>
      <div class="stats-card stat-card">
        <div class="stat-icon stat-icon--moon">
          <Moon :size="24" />
        </div>
        <div class="stat-card__content">
          <p class="stat-card__label">总听歌时长</p>
          <p class="stat-card__name">{{ formattedTotalDuration }}</p>
          <p class="stat-card__sub">{{ totalDuration > 0 ? '累计收听' : '' }}</p>
        </div>
      </div>
    </div>

    <!-- Year Report -->
    <div v-if="yearItems.length" class="stats-card year-card">
      <div class="chart-card__header">
        <h3 class="chart-card__title">历年听歌足迹</h3>
      </div>
      <div class="year-grid">
        <div v-for="item in yearItems" :key="item.year" class="year-item">
          <span class="year-num">{{ item.year }}</span>
          <span class="year-stat">{{ item.playNum }} 首</span>
          <span class="year-stat year-stat--sub">{{ formatMinutes(item.playDuration / 60) }}</span>
        </div>
      </div>
    </div>

    <!-- Top Songs -->
    <section v-if="topSongs.length">
      <div class="top-header">
        <h3 class="top-header__title">本周你最爱收听</h3>
      </div>
      <div class="top-list">
        <div v-for="(song, idx) in topSongs.slice(0, 10)" :key="song.id" class="top-row top-row--clickable" :class="{ playing: Number(song.id) > 0 && Number(song.id) === Number(playerStore.currentSongId || 0) }" @dblclick="playSong(song, idx)">
          <PlayPauseButton :song-id="Number(song.id || 0)" :index-label="idx + 1" @play="playSong(song, idx)" />
          <div class="top-row__cover">
            <img :src="song.picUrl + '?param=100y100'" :alt="song.name" loading="lazy" />
          </div>
          <div class="top-row__info">
            <p class="top-row__name">{{ song.name }}</p>
            <button v-if="song.artistId" type="button" class="artist-inline-btn" @click.stop="emit('open-artist', { id: song.artistId, name: song.artistName })">{{ song.artistName }}</button>
            <p v-else class="top-row__artist">{{ song.artistName }}</p>
          </div>
        </div>
      </div>
      <div v-if="!topSongs.length" class="top-empty">暂无数据</div>
    </section>
  </AnimatedAppear>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';
import AnimatedAppear from './AnimatedAppear.vue';
import { Trophy, Flame, Moon } from 'lucide-vue-next';
import { getListenTotal, getListenRealtimeReport, getListenReport, getListenYearReport, getListenTodaySong, getUserRecord } from '../api/music';
import { playerStore } from '../stores/player';
import { useUserStore } from '../stores/user';
const userStore = useUserStore();
import PlayPauseButton from './ui/PlayPauseButton.vue';

const emit = defineEmits<{
  (e: 'open-artist', artist: { id: number; name: string }): void;
}>();

const activeRange = ref<'7d' | '1m'>('7d');

const timeRanges = [
  { key: '7d' as const, label: '过去7天' },
  { key: '1m' as const, label: '过去1个月' },
];

// ── Data State ──
const totalDuration = ref(0);              // seconds
const weekDays = ref<{ label: string; pct: number; isPeak: boolean }[]>([]);
const periodPlayDuration = ref(0);        // minutes
const periodListenDays = ref(0);
const yearItems = ref<{ year: number; playNum: number; playDuration: number }[]>([]);
const topSongs = ref<{ id: number; name: string; artistName: string; artistId?: number; picUrl: string }[]>([]);

// ── Today's Songs (for heatmap popup) ──
const todaySongs = ref<{ id: number; name: string; artistName: string; picUrl: string }[]>([]);

// ── User Record (for most played song) ──
const userAllRecord = ref<any[]>([]);

interface PlayedSong {
  name: string;
  artist: string;
  playCount: number;
  id?: number;
  picUrl?: string;
  artistId?: number;
}
interface ActiveDay {
  date: string;
  duration: number;
}

const mostPlayedSong = computed<PlayedSong | null>(() => {
  // Priority 1: user/record (all-time play counts)
  if (userAllRecord.value.length) {
    const item = userAllRecord.value.reduce((max, cur) =>
      (cur.playCount || 0) > (max.playCount || 0) ? cur : max
    );
    const song = item.song || {};
    const artist = song.ar?.[0]?.name || song.artists?.[0]?.name || '未知';
    return {
      name: song.name || '未知', artist, playCount: item.playCount || 0,
      id: song.id,
      picUrl: song.al?.picUrl || '',
      artistId: song.ar?.[0]?.id || song.artists?.[0]?.id,
    };
  }
  // Priority 2: weekly report wallpaper (本周热门歌曲第一条)
  if (topSongs.value.length) {
    const s = topSongs.value[0];
    return { name: s.name, artist: s.artistName || '未知', playCount: 0, id: s.id, picUrl: s.picUrl, artistId: s.artistId };
  }
  return null;
});

const mostActiveDay = computed<ActiveDay | null>(() => {
  // Find the day with max duration from month durationDetails
  const details = monthDurationMap.value;
  const entries = Object.entries(details).filter(([, v]) => v > 0);
  if (!entries.length) return null;
  const [maxDate, maxDur] = entries.reduce((max, cur) => (cur[1] > max[1] ? cur : max));
  const d = new Date(maxDate + 'T00:00:00');
  const dateStr = `${d.getMonth() + 1}月${d.getDate()}日`;
  return { date: dateStr, duration: maxDur };
});

// ── Heatmap Data ──
const monthDurationMap = ref<Record<string, number>>({});

const heatmapCells = computed(() => {
  const now = new Date();
  const cells: { date: string; value: number; level: number }[] = [];
  const map = monthDurationMap.value;

  // Start 365 days ago, find the first Sunday to align the grid
  const start = new Date(now);
  start.setDate(start.getDate() - 364);
  start.setHours(0, 0, 0, 0);
  // Adjust to Sunday of that week
  start.setDate(start.getDate() - start.getDay());

  const end = new Date(start);
  end.setFullYear(end.getFullYear() + 1);
  // 确保包含今天（start 被前调到周日后 end 可能比今天还早）
  if (end <= now) {
    end.setDate(end.getDate() + 7);
  }

  for (let d = new Date(start); d < end; d.setDate(d.getDate() + 1)) {
    const key = formatDateKey(d);
    const value = map[key] || 0;
    let level = 0;
    if (value > 0) {
      if (value <= 5) level = 1;
      else if (value <= 20) level = 2;
      else if (value <= 60) level = 3;
      else level = 4;
    }
    cells.push({ date: key, value, level });
  }
  return cells;
});

const monthLabels = computed(() => {
  const labels: { idx: number; label: string }[] = [];
  const now = new Date();
  const start = new Date(now);
  start.setDate(start.getDate() - 364);
  start.setDate(start.getDate() - start.getDay());

  const months = ['1月','2月','3月','4月','5月','6月','7月','8月','9月','10月','11月','12月'];

  for (let w = 0; w < 53; w++) {
    const monday = new Date(start);
    monday.setDate(monday.getDate() + w * 7);
    const monthIdx = monday.getMonth();
    const isFirstWeek = monday.getDate() <= 7;
    if (isFirstWeek) {
      labels.push({ idx: w, label: months[monthIdx] });
    } else {
      const prev = new Date(monday);
      prev.setDate(prev.getDate() - 7);
      if (prev.getMonth() !== monthIdx) {
        labels.push({ idx: w, label: months[monthIdx] });
      } else {
        labels.push({ idx: w, label: '' });
      }
    }
  }
  return labels;
});

function formatDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function formatDateCN(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  const weekdays = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日${weekdays[d.getDay()]}`;
}

// ── Heatmap Popup ──
const heatmapPopup = ref<{ visible: boolean; date: string; value: number; isToday: boolean; style: Record<string, string> }>({
  visible: false,
  date: '',
  value: 0,
  isToday: false,
  style: {},
});

function openHeatmapPopup(event: MouseEvent, cell: { date: string; value: number }) {
  const el = event.currentTarget as HTMLElement;
  const rect = el.getBoundingClientRect();
  const heatmapCard = el.closest('.heatmap-card') as HTMLElement;
  const cardRect = heatmapCard?.getBoundingClientRect();

  let top = rect.top - (cardRect?.top || 0) - 8;
  let left = rect.left - (cardRect?.left || 0) + rect.width / 2;

  // Flip above if too close to top
  if (top < 120) top = rect.bottom - (cardRect?.top || 0) + 8;

  const todayKey = formatDateKey(new Date());

  heatmapPopup.value = {
    visible: true,
    date: formatDateCN(cell.date),
    value: cell.value,
    isToday: cell.date === todayKey,
    style: {
      position: 'absolute',
      top: `${top}px`,
      left: `${left}px`,
    },
  };
}

function closeHeatmapPopup() {
  heatmapPopup.value.visible = false;
}

// ── Computed ──
const formattedTotalDuration = computed(() => {
  const s = totalDuration.value;
  if (!s) return '--';
  const hours = Math.floor(s / 3600);
  const mins = Math.floor((s % 3600) / 60);
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
});

const periodDuration = computed(() => {
  const m = periodPlayDuration.value;
  if (!m) return '--';
  if (m < 60) return `${m} 分钟`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
});

const listenDaysText = computed(() => {
  const d = periodListenDays.value;
  if (!d) return '暂无记录';
  return `共 ${d} 天`;
});

const chartTitle = computed(() => {
  return activeRange.value === '7d' ? '每日听歌时长（本周）' : '每日听歌时长（本月）';
});

const chartLegend = computed(() => {
  return activeRange.value === '7d' ? '本周' : '本月';
});

// ── Helpers ──
function formatMinutes(m: number): string {
  if (m < 60) return `${Math.round(m)} 分钟`;
  const h = Math.floor(m / 60);
  const mins = Math.round(m % 60);
  return `${h}h ${mins}m`;
}

const WEEK_LABELS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

function buildWeekDays(details: { period: string; duration: number }[]): { label: string; pct: number; isPeak: boolean }[] {
  if (!details || !details.length) return [];
  const maxDur = Math.max(...details.map(d => d.duration), 1);
  return details.map(d => {
    const date = new Date(d.period + 'T00:00:00');
    const dayIdx = date.getDay();
    return {
      label: WEEK_LABELS[dayIdx] || d.period.slice(-2),
      pct: maxDur > 0 ? (d.duration / maxDur) * 100 : 0,
      isPeak: d.duration === maxDur && maxDur > 0,
    };
  });
}

function parseWallpaperSongs(wp: any): { id: number; name: string; artistName: string; artistId?: number; picUrl: string }[] {
  if (!wp || !wp.items) return [];
  return wp.items.map((item: any) => ({
    id: item.songId,
    name: item.songName,
    artistName: item.artists?.[0]?.artistName || '',
    artistId: item.artists?.[0]?.artistId,
    picUrl: item.picUrl || '',
  }));
}

// ── Data Fetching ──
async function fetchAll() {
  try {
    const cookie = userStore.state.loginCookie || undefined;
    const [totalRes] = await Promise.all([
      getListenTotal(cookie),
    ]);
    if (totalRes?.code === 200) {
      totalDuration.value = totalRes.data.totalDuration;
    }
  } catch {
    // silently fail
  }
}

async function fetchRealtime(type: 'week' | 'month') {
  try {
    const cookie = userStore.state.loginCookie || undefined;
    const res = await getListenRealtimeReport(type, cookie);
    if (res?.code === 200 && res.data?.listenTimeDistributionBlock) {
      const block = res.data.listenTimeDistributionBlock;
      periodPlayDuration.value = block.playDuration ?? 0;
      periodListenDays.value = block.listenDays ?? 0;
      weekDays.value = buildWeekDays(block.durationDetails);

      // Populate heatmap map from duration details
      if (block.durationDetails) {
        const map: Record<string, number> = {};
        for (const d of block.durationDetails) {
          map[d.period] = d.duration;
        }
        monthDurationMap.value = { ...monthDurationMap.value, ...map };
      }
    } else {
      weekDays.value = [];
      periodPlayDuration.value = 0;
      periodListenDays.value = 0;
    }
  } catch {
    weekDays.value = [];
    periodPlayDuration.value = 0;
    periodListenDays.value = 0;
  }
}

async function fetchYearReport() {
  try {
    const cookie = userStore.state.loginCookie || undefined;
    const res = await getListenYearReport(cookie);
    if (res?.code === 200 && res.data?.yearItems) {
      yearItems.value = res.data.yearItems;
    }
  } catch {
    // silently fail
  }
}

async function fetchWeekReport() {
  try {
    const cookie = userStore.state.loginCookie || undefined;
    const res = await getListenReport('week', undefined, cookie);
    if (res?.code === 200 && res.data?.wallpaperBlock) {
      topSongs.value = parseWallpaperSongs(res.data.wallpaperBlock);
    }
  } catch {
    // silently fail
  }
}

async function fetchUserRecord() {
  try {
    if (!userStore.state.isLogin || !userStore.state.profile?.userId) return;
    const cookie = userStore.state.loginCookie || undefined;
    const res = await getUserRecord(userStore.state.profile.userId, 0, cookie);
    if (res?.code === 200 && res.data?.allData) {
      userAllRecord.value = res.data.allData;
    }
  } catch {
    // silently fail
  }
}

async function playSong(song: { id: number; name: string; artistName: string; artistId?: number; picUrl: string }, idx: number) {
  if (!song.id) return;
  const track = {
    id: song.id,
    name: song.name,
    ar: [{ id: song.artistId, name: song.artistName || '' }],
    al: { picUrl: song.picUrl || '' },
  };
  playerStore.setPlaylist([track], 0);
  await playerStore.playByIndex(0);
  playerStore.openExpanded();
}

function playMostPlayed() {
  const song = mostPlayedSong.value;
  if (!song?.id) return;
  playSong({ id: song.id, name: song.name, artistName: song.artist, artistId: song.artistId, picUrl: song.picUrl || '' }, 0);
}

function switchRange(key: '7d' | '1m') {
  activeRange.value = key;
  if (key === '7d') {
    fetchRealtime('week');
  } else {
    fetchRealtime('month');
  }
}

async function fetchTodaySongs() {
  try {
    const cookie = userStore.state.loginCookie || undefined;
    const res = await getListenTodaySong(cookie);
    if (res?.code === 200 && Array.isArray(res.data)) {
      todaySongs.value = res.data.map((item: any) => ({
        id: item.songId || item.id,
        name: item.songName || item.name,
        artistName: item.artists?.[0]?.artistName || item.artist || '',
        picUrl: item.picUrl || '',
      }));
    }
  } catch {
    // silently fail
  }
}

onMounted(async () => {
  await Promise.all([
    fetchAll(),
    fetchRealtime('week'),
    fetchRealtime('month'),
    fetchYearReport(),
    fetchWeekReport(),
    fetchUserRecord(),
    fetchTodaySongs(),
  ]);
  document.addEventListener('click', onDocClick);
});

onUnmounted(() => {
  document.removeEventListener('click', onDocClick);
});

function onDocClick(e: MouseEvent) {
  const target = e.target as HTMLElement;
  if (!target.closest('.heatmap-popup') && !target.closest('.heatmap-cell')) {
    closeHeatmapPopup();
  }
}
</script>

<style scoped>
.stats-page {
  display: grid;
  gap: var(--space-6);
}

/* ── Header ── */
.stats-header {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: var(--space-4);
}

.stats-title {
  margin: 0;
  font-size: var(--text-headline-lg);
  font-weight: var(--text-headline-lg-weight, 700);
  line-height: var(--text-headline-lg-line, 1.15);
  letter-spacing: var(--text-headline-lg-letter, -0.01em);
  color: var(--text-main);
}

.stats-subtitle {
  margin: var(--space-1) 0 0;
  font-size: var(--text-body-md);
  font-weight: 400;
  line-height: 1.5;
  color: var(--text-sub);
}

/* ── Segmented Control ── */
.time-segmented {
  display: flex;
  padding: var(--space-1);
  background: var(--bg-muted);
  border-radius: 999px;
  width: fit-content;
}

.segmented-btn {
  padding: var(--space-2) var(--space-5);
  border: none;
  border-radius: 999px;
  background: transparent;
  color: var(--text-sub);
  font-size: var(--text-label-md);
  font-weight: 500;
  line-height: 1.4;
  cursor: pointer;
  transition: all 0.22s ease;
  white-space: nowrap;
}

.segmented-btn:hover {
  color: var(--text-main);
}

.segmented-btn.active {
  background: var(--bg-solid);
  color: var(--text-main);
  font-weight: 600;
  box-shadow: 0 1px 4px rgba(0,0,0,0.06);
}

/* ── Card Base ── */
.stats-card {
  background: var(--bg-solid);
  border: 1px solid var(--border);
  border-radius: var(--radius-xl);
  padding: var(--space-5);
}

.chart-empty,
.top-empty {
  text-align: center;
  padding: var(--space-6);
  color: var(--text-soft);
  font-size: var(--text-body-md);
}

/* ── Chart Card ── */
.chart-card__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: var(--space-6);
}

.chart-card__title {
  margin: 0;
  font-size: var(--text-headline-md);
  font-weight: 600;
  line-height: 1.3;
  color: var(--text-main);
}

.chart-legend {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.legend-dot {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: var(--accent);
}

.legend-label {
  font-size: var(--text-label-sm);
  font-weight: 600;
  line-height: 1.4;
  letter-spacing: 0.05em;
  color: var(--text-sub);
}

.chart-bars {
  height: 300px;
  display: flex;
  align-items: flex-end;
  gap: var(--space-4);
  position: relative;
}

.chart-grid-lines {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  pointer-events: none;
  opacity: 0.15;
}

.grid-line {
  border-top: 1px solid var(--border);
}

.bar-column {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-3);
}

.bar-fill {
  width: 100%;
  border-radius: var(--radius-md) var(--radius-md) 0 0;
  background: color-mix(in srgb, var(--accent) 25%, transparent);
  transition: all 0.4s ease;
  min-height: 4px;
}

.bar-column:hover .bar-fill {
  background: color-mix(in srgb, var(--accent) 40%, transparent);
}

.bar-fill--peak {
  background: var(--accent);
  box-shadow: 0 4px 16px color-mix(in srgb, var(--accent) 30%, transparent);
}

.bar-column:hover .bar-fill--peak {
  opacity: 0.9;
}

.bar-label {
  font-size: var(--text-label-sm);
  font-weight: 600;
  line-height: 1.4;
  letter-spacing: 0.05em;
  color: var(--text-sub);
}

.bar-label--active {
  color: var(--accent);
}

/* ── Insight Cards Grid ── */
.insight-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--space-6);
}

.insight-card {
  display: flex;
  align-items: center;
  gap: var(--space-5);
}

.insight-icon {
  width: 56px;
  height: 56px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--radius-xl);
  flex-shrink: 0;
}

.insight-icon--primary {
  background: color-mix(in srgb, var(--accent) 18%, transparent);
  color: var(--accent);
}

.insight-label {
  margin: 0 0 var(--space-1);
  font-size: var(--text-label-lg);
  font-weight: 500;
  line-height: 1.4;
  letter-spacing: 0.02em;
  color: var(--text-sub);
}

.insight-value-row {
  display: flex;
  align-items: baseline;
  gap: var(--space-2);
}

.insight-value {
  font-size: var(--text-headline-lg);
  font-weight: 700;
  line-height: 1.15;
  letter-spacing: -0.01em;
  color: var(--text-main);
}

.insight-delta {
  font-size: var(--text-label-lg);
  font-weight: 600;
  color: var(--text-sub);
}

/* ── Year Card ── */
.year-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: var(--space-3);
}

.year-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: var(--space-3);
  border-radius: var(--radius-md);
  background: color-mix(in srgb, var(--accent) 6%, transparent);
  gap: var(--space-1);
}

.year-num {
  font-size: var(--text-label-lg);
  font-weight: 700;
  color: var(--accent);
}

.year-stat {
  font-size: var(--text-label-sm);
  font-weight: 600;
  color: var(--text-main);
}

.year-stat--sub {
  color: var(--text-sub);
  font-weight: 500;
}

/* ── Top Lists ── */
.top-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: var(--space-5);
}

.top-header__title {
  margin: 0;
  font-size: var(--text-headline-md);
  font-weight: 600;
  line-height: 1.3;
  color: var(--text-main);
}

.top-list {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.top-row {
  display: flex;
  align-items: center;
  gap: var(--space-4);
  padding: var(--space-4);
  border-radius: var(--radius-lg);
  transition: background 0.22s ease;
  cursor: default;
}

.top-row:hover {
  background: color-mix(in srgb, var(--accent) 6%, var(--bg-surface));
}

.top-row.playing {
  background: color-mix(in srgb, var(--accent) 15%, var(--bg-surface));
  border-color: color-mix(in srgb, var(--accent) 44%, var(--border));
}

.top-row--clickable {
  cursor: pointer;
}

.top-row__cover {
  width: 56px;
  height: 56px;
  border-radius: var(--radius-md);
  overflow: hidden;
  flex-shrink: 0;
  box-shadow: 0 2px 8px rgba(0,0,0,0.08);
}

.top-row__cover img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.top-row__info {
  flex: 1;
  min-width: 0;
}

.top-row__name {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  line-height: 1.3;
  color: var(--text-main);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.top-row__artist {
  margin: var(--space-1) 0 0;
  font-size: var(--text-label-sm);
  font-weight: 600;
  line-height: 1.4;
  letter-spacing: 0.05em;
  color: var(--text-sub);
}

/* ── Heatmap Card ── */
.heatmap-card {
  overflow: visible;
}

.heatmap-legend-row {
  display: flex;
  align-items: center;
  gap: var(--space-1);
}

.heatmap-legend-label {
  font-size: var(--text-label-xs);
  font-weight: 600;
  letter-spacing: 0.05em;
  color: var(--text-soft);
}

.heatmap-cell-swatch {
  width: 12px;
  height: 12px;
  border-radius: 3px;
  flex-shrink: 0;
}

.heatmap-container {
  display: flex;
  gap: var(--space-2);
  margin-bottom: var(--space-1);
}

.heatmap-y-labels {
  display: flex;
  flex-direction: column;
  gap: 3px;
  padding-top: 0;
  min-width: 32px;
  flex-shrink: 0;
}

.heatmap-y-labels span {
  height: 14px;
  font-size: var(--text-label-xs);
  font-weight: 500;
  color: var(--text-soft);
  line-height: 14px;
}

.heatmap-grid {
  display: grid;
  grid-template-columns: repeat(53, 1fr);
  gap: 3px;
  flex: 1;
}

.heatmap-cell {
  width: 100%;
  aspect-ratio: 1;
  border-radius: 3px;
  background: var(--bg-muted);
  transition: all 0.15s ease;
  cursor: default;
}

.heatmap-cell:hover {
  outline: 2px solid var(--accent);
  outline-offset: 1px;
  transform: scale(1.3);
  z-index: 1;
  position: relative;
}

.heatmap-cell--l0 { background: var(--bg-muted); }
.heatmap-cell--l1 { background: color-mix(in srgb, var(--accent) 22%, var(--bg-solid)); }
.heatmap-cell--l2 { background: color-mix(in srgb, var(--accent) 45%, var(--bg-solid)); }
.heatmap-cell--l3 { background: color-mix(in srgb, var(--accent) 72%, var(--bg-solid)); }
.heatmap-cell--l4 { background: var(--accent); }

/* Heatmap Popup */
.heatmap-card {
  position: relative;
}

.heatmap-popup {
  position: absolute;
  z-index: 100;
  transform: translateX(-50%) translateY(-100%);
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  padding: var(--space-3) var(--space-4);
  box-shadow: 0 8px 24px rgba(0,0,0,0.18);
  min-width: 180px;
  pointer-events: auto;
}

.heatmap-popup__date {
  font-size: var(--text-label-md);
  font-weight: 600;
  color: var(--text-main);
  margin-bottom: var(--space-1);
}

.heatmap-popup__plays {
  font-size: var(--text-body-sm);
  color: var(--text-sub);
}

.heatmap-popup__divider {
  height: 1px;
  background: var(--border);
  margin: var(--space-2) 0;
}

.heatmap-popup__songs-title {
  font-size: var(--text-label-sm);
  font-weight: 600;
  color: var(--text-main);
  margin-bottom: var(--space-1);
}

.heatmap-popup__songs {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.heatmap-popup__song {
  font-size: var(--text-body-sm);
  color: var(--text-sub);
  white-space: nowrap;
}

.heatmap-popup__song-idx {
  color: var(--text-soft);
  margin-right: 4px;
}

.heatmap-popup__song-name {
  color: var(--text-main);
}

.heatmap-popup__song-artist {
  color: var(--text-soft);
  margin-left: 2px;
}

.heatmap-month-labels {
  display: grid;
  grid-template-columns: repeat(53, 1fr);
  margin-left: 40px;
  gap: 3px;
}

.heatmap-month-labels span {
  font-size: var(--text-label-xs);
  font-weight: 500;
  color: var(--text-soft);
  text-align: left;
  line-height: 1.6;
}

/* ── Stat Cards ── */
.stat-cards {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  gap: var(--space-6);
}

.stat-card {
  display: flex;
  align-items: flex-start;
  gap: var(--space-4);
  padding: var(--space-5);
}

.stat-icon {
  width: 48px;
  height: 48px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--radius-lg);
  flex-shrink: 0;
}

.stat-icon--trophy {
  background: color-mix(in srgb, var(--accent) 18%, transparent);
  color: var(--accent);
}

.stat-icon--fire {
  background: color-mix(in srgb, #f97316 18%, transparent);
  color: #f97316;
}

.stat-icon--moon {
  background: color-mix(in srgb, #a855f7 18%, transparent);
  color: #a855f7;
}

.stat-card__content {
  flex: 1;
  min-width: 0;
}

.stat-card__label {
  margin: 0 0 var(--space-1);
  font-size: var(--text-label-sm);
  font-weight: 600;
  line-height: 1.4;
  letter-spacing: 0.05em;
  color: var(--text-sub);
}

.stat-card__name {
  margin: 0;
  font-size: var(--text-body-md);
  font-weight: 600;
  line-height: 1.4;
  color: var(--text-main);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.stat-card__sub {
  margin: var(--space-1) 0 0;
  font-size: var(--text-label-sm);
  font-weight: 500;
  line-height: 1.4;
  color: var(--text-soft);
}

.stat-card__empty {
  margin: 0;
  font-size: var(--text-body-md);
  font-weight: 500;
  color: var(--text-soft);
}
</style>