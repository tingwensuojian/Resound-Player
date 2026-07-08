# 全屏播放页 UI 自动显隐 — 设置开关接入说明

## 功能概述

在设置页的「外观」tab 中增加「全屏播放页自动隐藏 UI」开关，用户可自行选择是否启用全屏播放页的 UI 自动隐显功能。

## 涉及文件

| 文件 | 改动 |
|---|---|
| `src/stores/ui.ts` | 新增 `autoHidePlayerUI` 属性 + 持久化 |
| `src/components/SettingsPage.vue` | 外观 tab 新增开关项 + switchState + watch |
| `src/composables/useAutoHideUI.ts` | 接受 `enabledRef` 参数，开关关闭时禁用隐显 |
| `src/components/PlayerExpanded.vue` | 传入 `uiStore.autoHidePlayerUI` |

## 实现细节

### 1. Store 层（`src/stores/ui.ts`）

```ts
// 常量
const AUTO_HIDE_UI_KEY = 'tm_auto_hide_player_ui'

// state 定义
autoHidePlayerUI: true,

// init 时读取
const savedAutoHide = localStorage.getItem(AUTO_HIDE_UI_KEY)
this.autoHidePlayerUI = savedAutoHide === null ? true : savedAutoHide === '1'

// setter
setAutoHidePlayerUI(enabled: boolean) {
  this.autoHidePlayerUI = enabled
  localStorage.setItem(AUTO_HIDE_UI_KEY, enabled ? '1' : '0')
}
```

### 2. 设置页（`src/components/SettingsPage.vue`）

在 `appearance` 分组的 items 末尾添加：

```ts
{ key: 'autoHidePlayerUI', label: '全屏播放页自动隐藏 UI', desc: '在全屏播放页中，无操作时自动隐藏顶部栏、右侧按钮和底部控制台', type: 'switch' }
```

在 `switchState` 中添加：

```ts
autoHidePlayerUI: uiStore.autoHidePlayerUI,
```

在 watch 区块添加：

```ts
watch(
  () => switchState.autoHidePlayerUI,
  (enabled) => {
    uiStore.setAutoHidePlayerUI(Boolean(enabled))
  },
)
```

### 3. Composable（`src/composables/useAutoHideUI.ts`）

```ts
export function useAutoHideUI(
  enabledSource: () => boolean,    // 响应式 getter，读取开关状态
  options?: {
    idleTimeout?: number             // 空闲超时（ms），默认 3000
    throttleDelay?: number           // mousemove 节流（ms），默认 300
  },
)
```

关键行为：

- **初始化时直接取反**：`const uiRevealed = ref(!enabledSource())`，开关关闭时立即初始化为 `true`
- 当 `enabledSource()` 返回 `false` 时，所有事件处理函数（`onActivity()`、`onLeave()`、`freeze()`、`unfreeze()`）均在入口处 `return`，不执行任何隐显逻辑。**`freeze()` / `unfreeze()` 是易遗漏的关键点**——若缺少守卫，鼠标划过控制区会触发 `unfreeze()` → 启动空闲计时器 → 3 秒后隐藏 UI，且开关关闭时 `onActivity()` 无操作，UI 将永久隐藏无法恢复
- 通过 `watch(() => enabledSource(), ..., { immediate: true })` 监听开关变化：关闭时强制 `uiRevealed = true` + 清除计时器，UI 始终保持可见

**完整守卫清单**（所有事件处理函数都必须检查开关状态）：

| 函数 | 守卫 | 绑定事件 |
|---|---|---|
| `onActivity` | `if (!enabledSource()) return` | 根元素 `@mousemove`、`@click` |
| `onLeave` | `if (!enabledSource()) return` | 根元素 `@mouseleave` |
| `freeze` | `if (!enabledSource()) return` | 控制区元素 `@mouseenter` |
| `unfreeze` | `if (!enabledSource()) return` | 控制区元素 `@mouseleave` |

### 4. 播放页（`src/components/PlayerExpanded.vue`）

```ts
const { uiRevealed, onActivity, onLeave, freeze, unfreeze } = useAutoHideUI(
  () => uiStore.autoHidePlayerUI,
  { idleTimeout: 3000 },
)
```

使用 `() => uiStore.autoHidePlayerUI` 作为 getter 传入，`uiStore` 为 `reactive` 对象，Vue 的响应式系统自动追踪依赖，开关变化实时生效。

## 复用模式

当需要为其他 composable 添加用户可配置的开关时，按此模式操作：

```ts
// 1. Store 加属性 + setter + localStorage 持久化
const SHOW_FOO_KEY = 'tm_show_foo'
export const uiStore = reactive({
  showFoo: true,
  init() {
    const saved = localStorage.getItem(SHOW_FOO_KEY)
    this.showFoo = saved === null ? true : saved === '1'
  },
  setShowFoo(enabled: boolean) {
    this.showFoo = enabled
    localStorage.setItem(SHOW_FOO_KEY, enabled ? '1' : '0')
  },
})

// 2. SettingsPage.vue
//    - groupsMap 对应 tab 的 items 中加 switch item
//    - switchState 中加 key + 初始值
//    - watch 区块加 watch 回调

// 3. Composable 接受 enabledRef
export function useSomeFeature(enabledRef: { value: boolean }, ...) {
  // 在入口处判断 enabledRef.value
  function onAction() {
    if (!enabledRef.value) return
    // ...
  }

  // 开关关闭时重置状态
  watch(enabledRef, (val) => {
    if (!val) {
      // 重置到默认状态
    }
  })
}

// 4. 组件中调用
useSomeFeature(toRef(uiStore, 'showFoo'), ...)
```

## 持久化 Key 规范

项目所有 UI 设置持久化 key 均使用 `tm_` 前缀：

| Key | 用途 |
|---|---|
| `tm_theme_mode` | 主题模式 |
| `tm_accent_mode` | 主题色 |
| `tm_accent_custom_color` | 自定义主题色 |
| `tm_unblock_enabled` | 音源替换开关 |
| `tm_unblock_sources` | 音源优先级 |
| `tm_resume_after_mv` | MV 关闭后恢复播放 |
| `tm_show_intel_indicator` | 心动图标 |
| `tm_auto_hide_player_ui` | 全屏播放页自动隐藏 UI |

新增设置项时，key 命名使用 `tm_` + 英文描述（snake_case）。