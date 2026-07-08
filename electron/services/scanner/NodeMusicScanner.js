    // 扫描时提取封面，直接写入本地缓存（避免浏览时再读NAS）
    if (this.coverCache && common.picture?.[0]) {
      try {
        const pic = common.picture[0];
        this.coverCache.saveCover(filePath, pic.data, pic.format);
      } catch {}
    }
