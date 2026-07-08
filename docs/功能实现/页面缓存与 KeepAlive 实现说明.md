# 页面缓存与 KeepAlive 实现说明

## 问题

左侧标签栏切换页面时，当前使用 `v-if`/`v-else-if` 链渲染，每次切换组件被完全销毁并重建：
- 已加载的数据丢失（需重新请求 API）
- 滚动位置重置到顶部
- 子页面栈丢失（如歌手链式跳转）

## 最终方案：KeepAlive + include 显式缓存（方案二）

使用 Vue 内置 `<KeepAlive :include>` 精确控制哪些页面被缓存，核心页面常驻内存，详情页每次重新加载。

### 核心原理

```
核心页面（home / search / playlist / rank / user / history / settings / mv / podcast-list）
  → KeepAlive 缓存实例，切换时不销毁、不重建
  → 保持滚动位置 + 已有数据 + 子页面栈

详情页（playlist-detail / album-detail / artist-detail / user-detail / rank-detail / ...）
  → 不在 include 列表中
  → 每次进入重新创建，保证数据最新
```

### 涉及的代码文件

### `src/App.vue` — 修改内容

#### 1. 导入 KeepAlive

```javascript
import { computed, KeepAlive, onBeforeUnmount, onMounted, watch, ref } from 'vue';
```

#### 2. 定义缓存策略

```javascript
// ── 页面缓存策略（方案二：KeepAlive + include 显式控制）──
// 核心页面缓存，切换时不销毁重建；详情页每次进入重新加载
const keepAlivePages = new Set([
  'home', 'search', 'playlist', 'rank', 'user',
  'history', 'settings', 'mv', 'podcast-list',
]);
// KeepAlive include 匹配组件名需与文件名（PascalCase）一致
const keepAliveNames = computed(() =>
  [...keepAlivePages].map(p =>
    p.split('-').map(s => s.charAt(0).toUpperCase() + s.slice(1)).join('') + 'Page'
  )
);
```

#### 3. 模板中包裹 KeepAlive

```html
<div class="content-shell">
  <KeepAlive :include="keepAliveNames">
    <HomePanel v-if="activePage === 'home'" .../>
    <SearchPage v-else-if="activePage === 'search'" .../>
    <!-- ... 其余分支保持不变 ... -->
    <PlaceholderPanel v-else :page-key="activePage" />
  </KeepAlive>
</div>
```

#### 4. 调整滚动行为

核心页面切换时不重置滚动位置，仅非缓存页面（详情页）跳转到顶部：

```javascript
// 缓存页面切换时不重置滚动，详情页进入时跳转顶部
watch(activePage, (page) => {
  if (!keepAlivePages.has(page)) scrollContentToTop();
});
```

---

## include 名称映射规则

`<KeepAlive :include>` 通过组件 `__name` 属性（Vue 编译器从文件名推断）匹配。

| 文件名 | 组件名（`__name`） | 缓存 |
|--------|-------------------|------|
| `HomePanel.vue` | `HomePanel` | ✅ |
| `SearchPage.vue` | `SearchPage` | ✅ |
| `PlaylistPanel.vue` | `PlaylistPanel` | ✅ |
| `RankPanel.vue` | `RankPanel` | ✅ |
| `UserPanel.vue` | `UserPanel` | ✅ |
| `HistoryPanel.vue` | `HistoryPanel` | ✅ |
| `SettingsPage.vue` | `SettingsPage` | ✅ |
| `MvPanel.vue` | `MvPanel` | ✅ |
| `PodcastListPage.vue` | `PodcastListPage` | ✅ |

`keepAliveNames` computed 自动将 page key（如 `'podcast-list'`）转换为组件名（`PodcastListPage`）。

---

## 生命周期变化

被缓存的组件：`onMounted` 仅首次进入时触发，后续切换触发 `onActivated` / `onDeactivated`。

| 生命周期 | 首次进入 | 从其他页面切回 |
|----------|---------|---------------|
| `onMounted` | ✅ 触发 | ❌ 不触发 |
| `onActivated` | ✅ KeepAlive 下等同于 mount | ✅ 触发 |
| `onDeactivated` | — | ✅ 离开时触发 |
| `onBeforeUnmount` | — | ❌ 仅从 include 中移除或 KeepAlive 销毁时触发 |

如果需要页面每次激活时刷新数据，使用 `onActivated`：

```javascript
import { onActivated } from 'vue';

onActivated(() => {
  // 每次页面显示时重新加载数据
  refreshData();
});
```

---

## 缓存粒度说明

| 页面类型 | 例子 | 缓存策略 |
|----------|------|---------|
| 核心列表页 | 首页、搜索、歌单分类、排行榜 | ✅ 常驻内存，切换零开销 |
| 用户页 | 用户中心、收藏历史、设置 | ✅ 常驻内存，含用户态 |
| 播客中心 | 播客列表 | ✅ 常驻内存 |
| 详情页 | 歌单详情、专辑详情、歌手详情 | ❌ 每次重建，保证数据最新 |
| 播客子页 | 播客分类、播客详情、播客订阅 | ❌ 每次重建 |

---

## 对比其他方案

| 方案 | 说明 | 适用场景 |
|------|------|---------|
| **方案一：全量 KeepAlive** | 不加 `include`，所有页面缓存 | 所有页面均需保持状态 |
| **方案二：keepAlivePages Set + include**（当前方案） | 核心页面缓存，详情页重建 | 核心页面需常驻，详情页需最新数据 |
| **方案三：多实例 + v-show** | 所有打开过的页面永不卸载 | 零切换开销，高频来回切换 |

---

## 注意事项

1. **`keepAlivePages` 使用 `Set`** — `has()` 查找 O(1)，适合频繁判断。
2. **组件名必须一致** — 文件名与导入名需一致，否则 `include` 匹配失败。
3. **详情页滚动** — 非缓存页面依然通过 `watch` 重置滚动到顶部。
4. **内存管理** — 核心页面常驻内存，9 个页面约额外占用 10-30MB，可接受。
5. **`defineOptions({ name })`** — 如组件文件名与导入名不一致，需在组件内显式声明 `defineOptions({ name: 'MyComponent' })`。