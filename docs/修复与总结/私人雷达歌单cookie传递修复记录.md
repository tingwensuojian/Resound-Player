# 私人雷达歌单 Cookie 传递修复记录

## 问题描述

首页的私人雷达卡片和歌单详情页展示的私人雷达歌单数据不正确：显示的歌单第一首歌是"过"（王嘉尔/林俊杰），而非正确的私人雷达歌单（ID: 3136952023，第一首"主角"王菲）。

## 根因分析

项目中多处调用 `getPlaylistDetail()` 时不传递登录 cookie。私人雷达歌单（ID: 3136952023）是用户专属歌单，不传 cookie 时 API 返回的是默认/缓存的其他数据，而非当前登录用户的私人雷达。

同时存在以下次要问题：

1. **歌单名称每日变化**：私人雷达歌单名称是动态的（如"今天从《主角》听起|私人雷达"），不能按固定名称匹配。
2. **`/recommend/resource` 不一定返回该歌单**：该接口返回的是每日推荐歌单列表，不一定包含私人雷达（ID: 3136952023），且不同账号返回结果不同。

## 修复内容

### 1. 固定私人雷达歌单 ID 常量

**文件：** `src/components/HomePanel.vue`

新增常量并让 `dailyRecoRadar` 计算属性直接返回固定 ID，不依赖 `/recommend/resource` 接口的返回结果：

```typescript
const PRIVATE_RADAR_ID = 3136952023;
const dailyRecoRadar = computed(() => ({
  id: PRIVATE_RADAR_ID,
  name: '私人雷达',
  picUrl: '',
  coverImgUrl: '',
}));
```

### 2. `fetchRadarPlaylistDetail()` 传递 cookie

**文件：** `src/components/HomePanel.vue`，`fetchRadarPlaylistDetail()` 函数

修复前：
```typescript
const { data } = await getPlaylistDetail(id, 8);
```

修复后：
```typescript
// 必须传递 cookie，否则 API 可能返回非登录用户的默认/缓存数据
const { data } = await getPlaylistDetail(id, 8, userStore.loginCookie || undefined);
```

### 3. `PlaylistDetailPage.vue` 传递 cookie

**文件：** `src/components/PlaylistDetailPage.vue`，详情页获取歌单函数

修复前：
```typescript
const { data } = await getPlaylistDetail(id, 30);
```

修复后：
```typescript
const { data } = await getPlaylistDetail(id, 30, userStore.loginCookie || undefined);
```

## 涉及的文件

| 文件 | 改动 |
|---|---|
| `src/components/HomePanel.vue` | 新增 `PRIVATE_RADAR_ID` 常量；`dailyRecoRadar` 改为固定值；`fetchRadarPlaylistDetail()` 传 cookie |
| `src/components/PlaylistDetailPage.vue` | 详情页获取 `getPlaylistDetail()` 传 cookie |

## 开发规范：所有调用 `getPlaylistDetail` 时必须传 cookie

`getPlaylistDetail()` 函数签名如下：

```typescript
export async function getPlaylistDetail(id: number, s = 8, cookie?: string)
```

**后续所有调用 `getPlaylistDetail` 的地方，必须传递 `userStore.loginCookie || undefined` 作为第三个参数。**

### 需要检查的常见遗漏点

- 首页卡片（雷达歌单、每日推荐等）的曲目获取
- 歌单详情页的歌单数据获取
- 雷达歌单列表的详情获取
- 用户创建/收藏歌单的详情获取

## 关于私人雷达歌单的几个关键事实

1. **歌单 ID 固定**：私人雷达歌单 ID 为 `3136952023`，对所有用户通用。
2. **名称每日变化**：歌单名称是动态生成的（如"今天从《主角》听起|私人雷达"），不能通过名称匹配。
3. **独立获取**：私人雷达歌单应通过硬编码 ID + `/playlist/detail` 接口直接获取，不应依赖 `/recommend/resource` 或 `/user/playlist` 等接口返回。
4. **需要登录**：该歌单是用户专属数据，所有 API 请求必须携带登录 cookie。