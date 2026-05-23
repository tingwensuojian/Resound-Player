import { apiClient } from './client';

export function getQrKey() {
  return apiClient.get('/login/qr/key', { params: { timestamp: Date.now() } });
}

export function createQr(unikey: string) {
  return apiClient.get('/login/qr/create', {
    params: { key: unikey, qrimg: true, timestamp: Date.now() },
  });
}

export function checkQrStatus(unikey: string) {
  return apiClient.get('/login/qr/check', {
    params: { key: unikey, timestamp: Date.now() },
  });
}

export function getLoginStatus(cookie?: string) {
  return apiClient.get('/login/status', {
    params: {
      timestamp: Date.now(),
      ...(cookie ? { cookie } : {}),
    },
  });
}

export function logout(cookie?: string) {
  return apiClient.post(
    '/logout',
    {},
    {
      params: {
        timestamp: Date.now(),
        ...(cookie ? { cookie } : {}),
      },
    },
  );
}

export function getUserAccount() {
  return apiClient.get('/user/account', {
    params: { timestamp: Date.now() },
  });
}

export function getUserDetail(uid: number) {
  return apiClient.get('/user/detail', {
    params: { uid, timestamp: Date.now() },
  });
}

export function getUserSubCount() {
  return apiClient.get('/user/subcount', {
    params: { timestamp: Date.now() },
  });
}

export function getUserRecord(uid: number, type: 0 | 1 = 0) {
  return apiClient.get('/user/record', {
    params: { uid, type, timestamp: Date.now() },
  });
}

export function getUserPlaylist(uid: number, cookie?: string) {
  return apiClient.get('/user/playlist', {
    params: {
      uid,
      ...(cookie ? { cookie } : {}),
      timestamp: Date.now(),
    },
  });
}

export function getUserLikeList(uid: number, cookie?: string) {
  return apiClient.get('/likelist', {
    params: {
      uid,
      ...(cookie ? { cookie } : {}),
      timestamp: Date.now(),
    },
  });
}

export function getUserCreatedPlaylist(uid: number, limit = 100, offset = 0, cookie?: string) {
  return apiClient.get('/user/playlist', {
    params: {
      uid,
      limit,
      offset,
      ...(cookie ? { cookie } : {}),
      timestamp: Date.now(),
    },
  });
}

export function getUserCollectedPlaylist(uid: number, limit = 100, offset = 0, cookie?: string) {
  return apiClient.get('/user/playlist', {
    params: {
      uid,
      limit,
      offset,
      ...(cookie ? { cookie } : {}),
      timestamp: Date.now(),
    },
  });
}

export function getMyCreatedVoiceList(limit = 20) {
  return apiClient.get('/voicelist/my/created', {
    params: {
      limit,
      timestamp: Date.now(),
    },
  });
}

export function getVipInfo(uid?: number, cookie?: string) {
  return apiClient.get('/vip/info', {
    params: {
      ...(uid ? { uid } : {}),
      timestamp: Date.now(),
      ...(cookie ? { cookie } : {}),
    },
  });
}
