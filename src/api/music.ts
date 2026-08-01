import { apiClient } from './client';

export async function searchMusic(
  keywords: string,
  params?: { limit?: number; offset?: number; type?: number },
) {
  const { data } = await apiClient.get('/cloudsearch', {
    params: {
      keywords,
      limit: params?.limit ?? 30,
      offset: params?.offset ?? 0,
      ...(typeof params?.type === 'number' ? { type: params.type } : {}),
    },
  });
  return data;
}

export async function searchMusicSuggest(keywords: string, type: 'mobile' | 'web' = 'web') {
  return apiClient.get('/search/suggest', {
    params: {
      keywords,
      ...(type === 'mobile' ? { type } : {}),
      timestamp: Date.now(),
    },
  });
}

export async function searchMusicHot() {
  return apiClient.get('/search/hot', {
    params: { timestamp: Date.now() },
  });
}

export async function searchMusicHotDetail() {
  return apiClient.get('/search/hot/detail', {
    params: { timestamp: Date.now() },
  });
}

export async function searchMusicDefault() {
  return apiClient.get('/search/default', {
    params: { timestamp: Date.now() },
  });
}

export async function getSongUrl(id: number, cookie?: string) {
  return apiClient.get('/song/url', {
    params: { id, timestamp: Date.now(), ...(cookie ? { cookie } : {}) },
  });
}

export async function getSongUrlV1(id: number, level = 'exhigh', cookie?: string) {
  return apiClient.get('/song/url/v1', {
    params: {
      id,
      level,

      timestamp: Date.now(),
      ...(cookie ? { cookie } : {}),
    },
  });
}

export async function getSongDetail(id: number) {
  return apiClient.get('/song/detail', {
    params: { ids: id, timestamp: Date.now() },
  });
}

export async function getSongDetailBatch(ids: number[]) {
  if (!ids.length) {
    return { data: { songs: [] } } as any;
  }

  return apiClient.get('/song/detail', {
    params: {
      ids: ids.join(','),
      timestamp: Date.now(),
    },
  });
}

export async function getSongLyric(id: number) {
  return apiClient.get('/lyric', {
    params: { id, timestamp: Date.now() },
  });
}

export async function getSongLyricNew(id: number) {
  return apiClient.get('/lyric/new', {
    params: { id, timestamp: Date.now() },
  });
}

export async function getCloudLyric(uid: number, sid: string | number) {
  return apiClient.get('/cloud/lyric/get', {
    params: {
      uid,
      sid,
      timestamp: Date.now(),
    },
  });
}

export async function getSongDynamicCover(id: number) {
  return apiClient.get('/song/dynamic/cover', {
    params: { id, timestamp: Date.now() },
  });
}

export async function getPlaylistCatList() {
  return apiClient.get('/playlist/catlist', {
    params: { timestamp: Date.now() },
  });
}

export async function getTopPlaylists(params: { cat?: string; order?: 'hot' | 'new'; limit?: number; offset?: number }) {
  return apiClient.get('/top/playlist', {
    params: {
      order: params.order || 'hot',
      cat: params.cat || '全部',
      limit: params.limit ?? 30,
      offset: params.offset ?? 0,
      timestamp: Date.now(),
    },
  });
}

export async function getHighQualityPlaylists(params: { cat?: string; limit?: number; before?: number }) {
  return apiClient.get('/top/playlist/highquality', {
    params: {
      cat: params.cat || '全部',
      limit: params.limit ?? 6,
      ...(params.before ? { before: params.before } : {}),
      timestamp: Date.now(),
    },
  });
}

export async function getRecommendPlaylists(cookie?: string) {
  return apiClient.get('/recommend/resource', {
    params: {
      ...(cookie ? { cookie } : {}),
      timestamp: Date.now(),
    },
  });
}

export async function getRecommendSongs(cookie?: string) {
  return apiClient.get('/recommend/songs', {
    params: {
      ...(cookie ? { cookie } : {}),
      timestamp: Date.now(),
    },
  });
}


export async function getPersonalFm(cookie?: string) {
  return apiClient.get('/personal_fm', {
    params: {
      ...(cookie ? { cookie } : {}),
      timestamp: Date.now(),
    },
  });
}

export async function trashPersonalFm(id: number, cookie?: string) {
  return apiClient.get('/fm_trash', {
    params: {
      id,
      ...(cookie ? { cookie } : {}),
      timestamp: Date.now(),
    },
  });
}

export async function getHistoryRecommendSongDates(cookie?: string) {
  return apiClient.get('/history/recommend/songs', {
    params: {
      ...(cookie ? { cookie } : {}),
      timestamp: Date.now(),
    },
  });
}

export async function getHistoryRecommendSongDetail(date: string, cookie?: string) {
  return apiClient.get('/history/recommend/songs/detail', {
    params: {
      date,
      ...(cookie ? { cookie } : {}),
      timestamp: Date.now(),
    },
  });
}

export async function getPlaylistDetail(id: number, s = 8, cookie?: string) {
  return apiClient.get('/playlist/detail', {
    params: {
      id,
      s,
      ...(cookie ? { cookie } : {}),
      timestamp: Date.now(),
    },
  });
}

export async function getDjRecommend() {
  return apiClient.get('/dj/recommend', {
    params: {
      timestamp: Date.now(),
    },
  });
}

export async function getDjDetail(rid: number) {
  return apiClient.get('/dj/detail', {
    params: {
      rid,
      timestamp: Date.now(),
    },
  });
}

export async function getDjProgram(params: { rid: number; limit?: number; offset?: number; asc?: boolean }) {
  return apiClient.get('/dj/program', {
    params: {
      rid: params.rid,
      limit: params.limit ?? 200,
      offset: params.offset ?? 0,
      asc: params.asc ?? false,
      timestamp: Date.now(),
    },
  });
}

export async function getDjSublist(cookie?: string) {
  return apiClient.get('/dj/sublist', {
    params: {
      ...(cookie ? { cookie } : {}),
      timestamp: Date.now(),
    },
  });
}

export async function getDjCatelist() {
  return apiClient.get('/dj/catelist', {
    params: {
      timestamp: Date.now(),
    },
  });
}

export async function getDjCategoryRecommend() {
  return apiClient.get('/dj/category/recommend', {
    params: {
      timestamp: Date.now(),
    },
  });
}

export async function getDjRecommendType(type: number) {
  return apiClient.get('/dj/recommend/type', {
    params: {
      type,
      timestamp: Date.now(),
    },
  });
}

export async function getDjRadioHot(params: { cateId: number; limit?: number; offset?: number }) {
  return apiClient.get('/dj/radio/hot', {
    params: {
      cateId: params.cateId,
      limit: params.limit ?? 30,
      offset: params.offset ?? 0,
      timestamp: Date.now(),
    },
  });
}

export async function getToplistDetail() {
  return apiClient.get('/toplist/detail', {
    params: {
      timestamp: Date.now(),
    },
  });
}

export async function getTopSongs(type: 0 | 7 | 96 | 8 | 16 = 0) {
  return apiClient.get('/top/song', {
    params: {
      type,
      timestamp: Date.now(),
    },
  });
}

export async function getTopArtists(params?: { limit?: number; offset?: number }) {
  return apiClient.get('/top/artists', {
    params: {
      limit: params?.limit ?? 50,
      offset: params?.offset ?? 0,
      timestamp: Date.now(),
    },
  });
}

export async function getArtistList(params?: {
  type?: -1 | 1 | 2 | 3;
  area?: -1 | 0 | 7 | 8 | 16 | 96;
  initial?: -1 | 0 | string;
  limit?: number;
  offset?: number;
}) {
  return apiClient.get('/artist/list', {
    params: {
      type: params?.type ?? -1,
      area: params?.area ?? -1,
      initial: params?.initial ?? -1,
      limit: params?.limit ?? 30,
      offset: params?.offset ?? 0,
      timestamp: Date.now(),
    },
  });
}

export async function getArtistDetail(id: number) {
  return apiClient.get('/artist/detail', {
    params: {
      id,
      timestamp: Date.now(),
    },
  });
}

export async function getArtistTopSongs(id: number) {
  return apiClient.get('/artists', {
    params: {
      id,
      timestamp: Date.now(),
    },
  });
}

export async function getArtistAlbums(id: number, params?: { limit?: number; offset?: number }) {
  return apiClient.get('/artist/album', {
    params: {
      id,
      limit: params?.limit ?? 24,
      offset: params?.offset ?? 0,
      timestamp: Date.now(),
    },
  });
}

export async function getArtistMvs(id: number, params?: { limit?: number; offset?: number }) {
  return apiClient.get('/artist/mv', {
    params: {
      id,
      limit: params?.limit ?? 24,
      offset: params?.offset ?? 0,
      timestamp: Date.now(),
    },
  });
}

export async function getArtistDescription(id: number) {
  return apiClient.get('/artist/desc', {
    params: {
      id,
      timestamp: Date.now(),
    },
  });
}

export async function getArtistSongs(
  id: number,
  params?: { order?: 'hot' | 'time'; limit?: number; offset?: number },
) {
  return apiClient.get('/artist/songs', {
    params: {
      id,
      order: params?.order ?? 'time',
      limit: params?.limit ?? 50,
      offset: params?.offset ?? 0,
      timestamp: Date.now(),
    },
  });
}

export async function getNewestAlbums() {
  return apiClient.get('/album/newest', {
    params: {
      timestamp: Date.now(),
    },
  });
}

export async function getTopAlbums(params?: {
  area?: 'ALL' | 'ZH' | 'EA' | 'KR' | 'JP';
  type?: 'new' | 'hot';
  year?: number;
  month?: number;
  limit?: number;
  offset?: number;
}) {
  const now = new Date();
  return apiClient.get('/top/album', {
    params: {
      area: params?.area || 'ALL',
      type: params?.type || 'new',
      year: params?.year ?? now.getFullYear(),
      month: params?.month ?? now.getMonth() + 1,
      limit: params?.limit ?? 12,
      offset: params?.offset ?? 0,
      timestamp: Date.now(),
    },
  });
}

export async function getPlaylistTrackAll(params: { id: number; limit?: number; offset?: number; cookie?: string }) {
  return apiClient.get('/playlist/track/all', {
    params: {
      id: params.id,
      ...(typeof params.limit === 'number' ? { limit: params.limit } : {}),
      ...(typeof params.offset === 'number' ? { offset: params.offset } : {}),
      ...(params.cookie ? { cookie: params.cookie } : {}),
      timestamp: Date.now(),
    },
  });
}

export async function getAlbumDetail(id: number) {
  return apiClient.get('/album', {
    params: {
      id,
      timestamp: Date.now(),
    },
  });
}

export async function getAlbumSublist(params?: { limit?: number; offset?: number; cookie?: string }) {
  return apiClient.get('/album/sublist', {
    params: {
      limit: params?.limit ?? 25,
      offset: params?.offset ?? 0,
      ...(params?.cookie ? { cookie: params.cookie } : {}),
      timestamp: Date.now(),
    },
  });
}

export async function getArtistSublist(params?: { limit?: number; offset?: number; cookie?: string }) {
  return apiClient.get('/artist/sublist', {
    params: {
      limit: params?.limit ?? 25,
      offset: params?.offset ?? 0,
      ...(params?.cookie ? { cookie: params.cookie } : {}),
      timestamp: Date.now(),
    },
  });
}

export async function getAllMvs(params: {
  area?: '全部' | '内地' | '港台' | '欧美' | '日本' | '韩国';
  type?: '全部' | '官方版' | '原生' | '现场版' | '网易出品';
  order?: '上升最快' | '最热' | '最新';
  limit?: number;
  offset?: number;
}) {
  return apiClient.get('/mv/all', {
    params: {
      area: params.area || '全部',
      type: params.type || '全部',
      order: params.order || '上升最快',
      limit: params.limit ?? 30,
      offset: params.offset ?? 0,
      timestamp: Date.now(),
    },
  });
}

export async function getMvUrl(id: number, r = 1080) {
  return apiClient.get('/mv/url', {
    params: {
      id,
      r,
      timestamp: Date.now(),
    },
  });
}

export async function getMvDetail(mvid: number) {
  return apiClient.get('/mv/detail', {
    params: {
      mvid,
      timestamp: Date.now(),
    },
  });
}

export async function getMvDetailInfo(mvid: number) {
  return apiClient.get('/mv/detail/info', {
    params: {
      mvid,
      timestamp: Date.now(),
    },
  });
}

export async function getVoiceListSearch(params: { keyword: string; limit?: number; offset?: number }) {
  return apiClient.get('/voicelist/search', {
    params: {
      keyword: params.keyword,
      limit: params.limit ?? 10,
      offset: params.offset ?? 0,
      timestamp: Date.now(),
    },
  });
}

export async function getVoiceListDetail(voiceListId: number) {
  return apiClient.get('/voicelist/detail', {
    params: {
      id: voiceListId,
      timestamp: Date.now(),
    },
  });
}

export async function getVoiceListItems(params: { voiceListId: number; limit?: number; offset?: number }) {
  return apiClient.get('/voicelist/list', {
    params: {
      voiceListId: params.voiceListId,
      limit: params.limit ?? 200,
      offset: params.offset ?? 0,
      timestamp: Date.now(),
    },
  });
}

export async function getVoiceListSearchItems(params: {
  radioId?: number;
  name?: string;
  displayStatus?: string | null;
  type?: 'PUBLIC' | 'PRIVATE' | null;
  voiceFeeType?: number | null;
  limit?: number;
  offset?: number;
}) {
  return apiClient.get('/voicelist/list/search', {
    params: {
      radioId: params.radioId,
      name: params.name,
      displayStatus: params.displayStatus ?? null,
      type: params.type ?? null,
      voiceFeeType: params.voiceFeeType ?? null,
      limit: params.limit ?? 20,
      offset: params.offset ?? 0,
      timestamp: Date.now(),
    },
  });
}

export async function getVoiceDetail(id: number, cookie?: string) {
  return apiClient.get('/voice/detail', {
    params: {
      id,
      ...(cookie ? { cookie } : {}),
      timestamp: Date.now(),
    },
  });
}

export async function getCloudStorage(params?: { limit?: number; offset?: number; cookie?: string }) {
  return apiClient.get('/user/cloud', {
    params: {
      limit: params?.limit ?? 30,
      offset: params?.offset ?? 0,
      ...(params?.cookie ? { cookie: params.cookie } : {}),
      timestamp: Date.now(),
    },
  });
}

export async function getCloudStorageDetail(ids: string | number | Array<string | number>, cookie?: string) {
  const value = Array.isArray(ids) ? ids.join(',') : String(ids);
  return apiClient.get('/user/cloud/detail', {
    params: {
      id: value,
      ...(cookie ? { cookie } : {}),
      timestamp: Date.now(),
    },
  });
}

export async function getRecentSongs(limit = 100, cookie?: string) {
  return apiClient.get('/record/recent/song', {
    params: {
      limit,
      ...(cookie ? { cookie } : {}),
      timestamp: Date.now(),
    },
  });
}

export async function getRecentPlaylists(limit = 100, cookie?: string) {
  return apiClient.get('/record/recent/playlist', {
    params: {
      limit,
      ...(cookie ? { cookie } : {}),
      timestamp: Date.now(),
    },
  });
}

export async function getRecentAlbums(limit = 100, cookie?: string) {
  return apiClient.get('/record/recent/album', {
    params: {
      limit,
      ...(cookie ? { cookie } : {}),
      timestamp: Date.now(),
    },
  });
}

export async function getRecentDj(limit = 100, cookie?: string) {
  return apiClient.get('/record/recent/dj', {
    params: {
      limit,
      ...(cookie ? { cookie } : {}),
      timestamp: Date.now(),
    },
  });
}

export async function getRecentVoices(limit = 100, cookie?: string) {
  return apiClient.get('/record/recent/voice', {
    params: {
      limit,
      ...(cookie ? { cookie } : {}),
      timestamp: Date.now(),
    },
  });
}

export async function getMvUgcInfo(id: number) {
  return apiClient.get('/ugc/mv/get', {
    params: {
      id,
      timestamp: Date.now(),
    },
  });
}

export async function getSongEncyclopedia(id: number, cookie?: string) {
  return apiClient.get('/ugc/song/get', {
    params: {
      id,
      ...(cookie ? { cookie } : {}),
      timestamp: Date.now(),
    },
  });
}

export async function getSongWikiSummary(id: number) {
  return apiClient.get('/song/wiki/summary', {
    params: { id, timestamp: Date.now() },
  });
}

export async function getMvComments(params: {
  id: number;
  limit?: number;
  offset?: number;
  before?: number;
}) {
  return apiClient.get('/comment/mv', {
    params: {
      id: params.id,
      limit: params.limit ?? 20,
      offset: params.offset ?? 0,
      ...(params.before ? { before: params.before } : {}),
      timestamp: Date.now(),
    },
  });
}

export async function sendMvComment(params: {
  id: number;
  content: string;
  commentId?: number;
  cookie?: string;
}) {
  return apiClient.post('/comment', null, {
    params: {
      t: params.commentId ? 2 : 1,
      type: 1,
      id: params.id,
      content: params.content,
      ...(params.commentId ? { commentId: params.commentId } : {}),
      ...(params.cookie ? { cookie: params.cookie } : {}),
      timestamp: Date.now(),
    },
  });
}

export async function deleteSongComment(params: { id: number; commentId: number; cookie?: string }) {
  return apiClient.post('/comment', null, { params: { t: 0, type: 0, id: params.id, commentId: params.commentId, ...(params.cookie ? { cookie: params.cookie } : {}), timestamp: Date.now() } });
}

export async function deleteDjComment(params: { id: number; commentId: number; cookie?: string }) {
  return apiClient.post('/comment', null, { params: { t: 0, type: 4, id: params.id, commentId: params.commentId, ...(params.cookie ? { cookie: params.cookie } : {}), timestamp: Date.now() } });
}

export async function deleteMvComment(params: { id: number; commentId: number; cookie?: string }) {
  return apiClient.post('/comment', null, {
    params: {
      t: 0,
      type: 1,
      id: params.id,
      commentId: params.commentId,
      ...(params.cookie ? { cookie: params.cookie } : {}),
      timestamp: Date.now(),
    },
  });
}

export async function deletePlaylistComment(params: { id: number; commentId: number; cookie?: string }) {
  return apiClient.post('/comment', null, {
    params: {
      t: 0,
      type: 2,
      id: params.id,
      commentId: params.commentId,
      ...(params.cookie ? { cookie: params.cookie } : {}),
      timestamp: Date.now(),
    },
  });
}

export async function deleteAlbumComment(params: { id: number; commentId: number; cookie?: string }) {
  return apiClient.post('/comment', null, {
    params: {
      t: 0,
      type: 3,
      id: params.id,
      commentId: params.commentId,
      ...(params.cookie ? { cookie: params.cookie } : {}),
      timestamp: Date.now(),
    },
  });
}

export async function toggleSongLike(params: { id: number; like: boolean; uid?: number; cookie?: string }) {
  return apiClient.get('/like', {
    params: {
      id: params.id,
      like: params.like ? 'true' : 'false',
      ...(typeof params.uid === 'number' ? { uid: params.uid } : {}),
      ...(params.cookie ? { cookie: params.cookie } : {}),
      timestamp: Date.now(),
    },
  });
}

export async function togglePlaylistSubscribe(params: { id: number; subscribe: boolean; cookie?: string }) {
  return apiClient.get('/playlist/subscribe', {
    params: {
      id: params.id,
      t: params.subscribe ? 1 : 2,
      ...(params.cookie ? { cookie: params.cookie } : {}),
      timestamp: Date.now(),
    },
  });
}

export async function toggleAlbumSubscribe(params: { id: number; subscribe: boolean; cookie?: string }) {
  return apiClient.get('/album/sub', {
    params: {
      id: params.id,
      t: params.subscribe ? 1 : 0,
      ...(params.cookie ? { cookie: params.cookie } : {}),
      timestamp: Date.now(),
    },
  });
}

export async function getUserPlaylist(uid: number, cookie?: string) {
  return apiClient.get('/user/playlist', { params: { uid, ...(cookie ? { cookie } : {}), timestamp: Date.now() } });
}

export async function getSongComments(params: { id: number; limit?: number; offset?: number; cookie?: string }) {
  return apiClient.get('/comment/music', { params: { ...params, timestamp: Date.now() } });
}

export async function getPlaylistComments(params: { id: number; limit?: number; offset?: number; cookie?: string }) {
  return apiClient.get('/comment/playlist', { params: { ...params, timestamp: Date.now() } });
}

export async function getAlbumComments(params: { id: number; limit?: number; offset?: number; cookie?: string }) {
  return apiClient.get('/comment/album', { params: { ...params, timestamp: Date.now() } });
}

export async function getDjComments(params: { id: number; limit?: number; offset?: number; cookie?: string }) {
  return apiClient.get('/comment/dj', { params: { ...params, timestamp: Date.now() } });
}

/** 电台（频道）评论 — type=7 映射 A_DR_14_ */
export async function getRadioComments(params: { id: number; limit?: number; offset?: number; cookie?: string }) {
  return apiClient.get('/comment/new', {
    params: {
      id: params.id,
      type: 7,
      pageNo: ((params.offset || 0) / (params.limit || 20)) + 1,
      pageSize: params.limit || 20,
      sortType: 1,
      timestamp: Date.now(),
    },
  });
}

export async function getVideoComments(params: { id: number; limit?: number; offset?: number; cookie?: string }) {
  return apiClient.get('/comment/video', { params: { ...params, timestamp: Date.now() } });
}

export async function getCommentHot(params: { id: number; type: number; limit?: number; offset?: number; before?: number }) {
  return apiClient.get('/comment/hot', {
    params: {
      id: params.id,
      type: params.type,
      limit: params.limit ?? 20,
      offset: params.offset ?? 0,
      ...(params.before ? { before: params.before } : {}),
      timestamp: Date.now(),
    },
  });
}

export async function addTrackToPlaylist(pid: number, tracks: number[], cookie?: string) {
  return apiClient.get('/playlist/tracks', { params: { op: 'add', pid, tracks: tracks.join(','), ...(cookie ? { cookie } : {}), timestamp: Date.now() } });
}

export async function sendComment(params: { id: number; t: number; content: string; type?: number; commentId?: number; cookie?: string }) {
  return apiClient.get('/comment', { params: { t: params.t, type: params.type ?? 0, id: params.id, content: params.content, ...(params.commentId ? { commentId: params.commentId } : {}), ...(params.cookie ? { cookie: params.cookie } : {}), timestamp: Date.now() } });
}

export async function likeComment(params: { id: number; cid: number; t: number; type: number; cookie?: string }) {
  return apiClient.post('/comment/like', null, { params: { id: params.id, cid: params.cid, t: params.t, type: params.type, ...(params.cookie ? { cookie: params.cookie } : {}), timestamp: Date.now() } });
}

export async function toggleDjSubscribe(params: { rid: number; subscribe: boolean; cookie?: string }) {
  return apiClient.get('/dj/sub', {
    params: {
      rid: params.rid,
      t: params.subscribe ? 1 : 0,
      ...(params.cookie ? { cookie: params.cookie } : {}),
      timestamp: Date.now(),
    },
  });
}

export async function toggleArtistSubscribe(params: { id: number; subscribe: boolean; cookie?: string }) {
  return apiClient.get('/artist/sub', {
    params: {
      id: params.id,
      t: params.subscribe ? 1 : 0,
      ...(params.cookie ? { cookie: params.cookie } : {}),
      timestamp: Date.now(),
    },
  });
}

export async function toggleUserFollow(params: { id: number; follow: boolean; cookie?: string }) {
  return apiClient.get('/follow', {
    params: {
      id: params.id,
      t: params.follow ? 1 : 0,
      ...(params.cookie ? { cookie: params.cookie } : {}),
      timestamp: Date.now(),
    },
  });
}

export async function getUserMutualFollow(uid: number, cookie?: string) {
  return apiClient.get('/user/mutualfollow/get', {
    params: {
      uid,
      ...(cookie ? { cookie } : {}),
      timestamp: Date.now(),
    },
  });
}

export async function getUserFollows(uid: number, params?: { limit?: number; offset?: number; cookie?: string }) {
  return apiClient.get('/user/follows', {
    params: {
      uid,
      limit: params?.limit ?? 30,
      offset: params?.offset ?? 0,
      ...(params?.cookie ? { cookie: params.cookie } : {}),
      timestamp: Date.now(),
    },
  });
}

// 云盘导入歌曲（无需上传文件，直接导入网易云已有音源或已上传文件）
export async function importToCloud(params: {
  song: string;      // 歌名/文件名
  fileType: string;  // 文件后缀（mp3/flac等）
  fileSize: number;  // 文件大小（字节）
  bitrate: number;   // 比特率（kbps，Math.floor(br/1000)）
  md5: string;       // 文件 MD5
  id?: number;       // 歌曲 ID（如果是网易云自有音源必须填写）
  artist?: string;   // 歌手（默认 未知）
  album?: string;    // 专辑（默认 未知）
  cookie?: string;
}) {
  return apiClient.get('/cloud/import', {
    params: {
      song: params.song,
      fileType: params.fileType,
      fileSize: params.fileSize,
      bitrate: params.bitrate,
      md5: params.md5,
      ...(params.id ? { id: params.id } : {}),
      ...(params.artist ? { artist: params.artist } : {}),
      ...(params.album ? { album: params.album } : {}),
      ...(params.cookie ? { cookie: params.cookie } : {}),
      timestamp: Date.now(),
    },
  });
}

/**
 * 获取心动模式/智能播放列表
 * 必选参数：id=歌曲id, pid=歌单id
 * 可选参数：sid=要开始播放的歌曲的id
 */
export async function getIntelligenceList(params: {
  id: number;
  pid: number;
  sid?: number;
  cookie?: string;
}) {
  return apiClient.get('/playmode/intelligence/list', {
    params: {
      id: params.id,
      pid: params.pid,
      ...(typeof params.sid === 'number' ? { sid: params.sid } : {}),
      ...(params.cookie ? { cookie: params.cookie } : {}),
      timestamp: Date.now(),
    },
  });
}

/**
 * 设置私人 FM 模式
 * 必选参数：mode (aidj, DEFAULT, FAMILIAR, EXPLORE, SCENE_RCMD)
 * 可选参数：submode (当 mode 为 SCENE_RCMD 时: EXERCISE, FOCUS, NIGHT_EMO)
 * 返回新的私人 FM 歌曲列表
 */
export async function setPersonalFmMode(params: {
  mode: string;
  submode?: string;
  cookie?: string;
}) {
  const queryParams: Record<string, any> = {
    mode: params.mode,
    timestamp: Date.now(),
  };
  if (params.submode) {
    queryParams.submode = params.submode;
  }
  if (params.cookie) {
    queryParams.cookie = params.cookie;
  }
  return apiClient.get('/personal/fm/mode', { params: queryParams });
}

/* ── Listening Data APIs ── */

/** 总收听时长（秒） */
export async function getListenTotal(cookie?: string) {
  const params: Record<string, any> = { timestamp: Date.now() };
  if (cookie) params.cookie = cookie;
  const { data } = await apiClient.get('/listen/data/total', { params });
  return data as { code: number; data: { totalDuration: number }; message: string };
}

/** 今日收听 */
export async function getListenTodaySong(cookie?: string) {
  const params: Record<string, any> = { timestamp: Date.now() };
  if (cookie) params.cookie = cookie;
  const { data } = await apiClient.get('/listen/data/today/song', { params });
  return data;
}

/** 实时收听报告（本周/本月）type: week | month */
export async function getListenRealtimeReport(type: 'week' | 'month', cookie?: string) {
  const params: Record<string, any> = { type, timestamp: Date.now() };
  if (cookie) params.cookie = cookie;
  const { data } = await apiClient.get('/listen/data/realtime/report', { params });
  return data;
}

/** 收听报告（周/月/年）type: week | month | year, endTime?: number */
export async function getListenReport(type: 'week' | 'month' | 'year', endTime?: number, cookie?: string) {
  const params: Record<string, any> = { type, timestamp: Date.now() };
  if (endTime) params.endTime = endTime;
  if (cookie) params.cookie = cookie;
  const { data } = await apiClient.get('/listen/data/report', { params });
  return data;
}

/** 年度听歌足迹 */
export async function getListenYearReport(cookie?: string) {
  const params: Record<string, any> = { timestamp: Date.now() };
  if (cookie) params.cookie = cookie;
  const { data } = await apiClient.get('/listen/data/year/report', { params });
  return data as { code: number; data: { displayYear: number; yearItems: { year: number; playNum: number; playDuration: number }[] }; message: string };
}

/** 用户播放记录 type=0 allData, type=1 weekData */
export async function getUserRecord(uid: number, type: 0 | 1 = 0, cookie?: string) {
  const params: Record<string, any> = { uid, type, timestamp: Date.now() };
  if (cookie) params.cookie = cookie;
  const { data } = await apiClient.get('/user/record', { params });
  return data;
}
