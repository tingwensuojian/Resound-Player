<template>
  <AnimatedAppear tag="div" variant="content" rhythm="shell" class-name="home-page">

    <AnimatedAppear tag="section" variant="content" rhythm="head" class-name="home-top-reco">
      <AnimatedAppear tag="article" variant="content" rhythm="body" class-name="top-mini-card radar-card" :index="0">
        <button class="radar-hero poster" :class="{ 'is-skeleton': !dailyRecommendSongs.length }" :title="dailyRecommendHeroTitle" @click="openDailyRecommendDetail">
          <span class="radar-bg fade-in-bg" :class="{ 'bg-loaded': dailyBgLoaded }" :style="{ backgroundImage: `url(${dailyRecommendCoverUrl || ''})` }"></span>
          <template v-if="dailyRecommendSongs.length">
            <span class="radar-poster-top">
              <span class="radar-top-title">每日推荐</span>
            </span>
            <span class="radar-bottom-zone">
              <span class="radar-poster-bottom">每日推荐｜从「{{ dailyRecommendHeroSubtitle || '今日为你更新' }}」听起</span>
              <span class="radar-hover-list">
                <span
                  v-for="(track, idx) in dailyRecommendTracks"
                  :key="track.id || `${track.name}-${idx}`"
                  class="radar-hover-item"
                  @click.stop="playDailyRecommendByIndex(idx)"
                >
                  <span class="radar-hover-rank">{{ idx + 1 }}</span>
                  <span class="radar-hover-name">{{ track.name }}</span>
                  <span class="radar-hover-artist">
                    <button
                      v-for="artist in getTrackArtists(track)"
                      :key="`${track.id || idx}-${artist.id || artist.name}`"
                      type="button"
                      class="artist-inline-btn"
                      @click.stop="openArtistDetail(artist)"
                    >
                      {{ artist.name || '未知歌手' }}
                    </button>
                    <span v-if="!getTrackArtists(track).length">未知歌手</span>
                  </span>
                </span>
              </span>
            </span>
          </template>
          <span v-else class="skeleton-text">{{ dailyRecommendLoading ? '每日推荐加载中…' : dailyRecommendError || '登录后可查看每日推荐' }}</span>
        </button>
      </AnimatedAppear>

      <AnimatedAppear v-if="userStore.state.isLogin" tag="article" variant="content" rhythm="body" class-name="top-mini-card radar-card" :index="1">
        <button class="radar-hero poster" :class="{ 'is-skeleton': !topRecoCard }" :title="topRecoCard?.name" @click="topRecoCard && openRecoDetail(topRecoCard.id)">
          <span class="radar-bg fade-in-bg" :class="{ 'bg-loaded': topRecoBgLoaded }" :style="{ backgroundImage: `url(${topRecoCardCoverUrl})` }"></span>
          <template v-if="topRecoCard">
            <span class="radar-poster-top">
              <span class="radar-top-title">{{ topRecoCardTitle }}</span>
              <button
                v-if="resolvePlaylistCreatorId(topRecoCard)"
                type="button"
                class="creator-inline-btn"
                @click.stop="openUserDetailById(resolvePlaylistCreatorId(topRecoCard))"
              >
                {{ resolvePlaylistCreatorName(topRecoCard) }}
              </button>
            </span>
            <span class="radar-bottom-zone">
              <span class="radar-poster-bottom">{{ topRecoCardSubtitle }}</span>
              <span class="radar-hover-list">
                <span
                  v-for="(track, idx) in topRecoTracks.slice(0, 3)"
                  :key="track.id || `${track.name}-${idx}`"
                  class="radar-hover-item"
                  @click.stop="playRecoByIndex(idx)"
                >
                  <span class="radar-hover-rank">{{ idx + 1 }}</span>
                  <span class="radar-hover-name">{{ track.name }}</span>
                  <span class="radar-hover-artist">
                    <button
                      v-for="artist in getTrackArtists(track)"
                      :key="`${track.id || idx}-${artist.id || artist.name}`"
                      type="button"
                      class="artist-inline-btn"
                      @click.stop="openArtistDetail(artist)"
                    >
                      {{ artist.name || '未知歌手' }}
                    </button>
                    <span v-if="!getTrackArtists(track).length">未知歌手</span>
                  </span>
                </span>
              </span>
            </span>
          </template>
          <span v-else class="skeleton-text">{{ topRecoLoading ? `${topRecoCardTitle}加载中…` : topRecoError || topRecoEmptyText }}</span>
        </button>
      </AnimatedAppear>

      <AnimatedAppear tag="article" variant="content" rhythm="body" class-name="top-mini-card fm-card" :index="2">
        <button class="fm-hero poster" :class="{ 'is-skeleton': !personalFmTracks.length }" :title="personalFmTracks[0]?.name" @click="personalFmTracks.length && playPersonalFmByIndex(0)" @mouseenter="fmHovered = true" @mouseleave="fmHovered = false">
          <span class="fm-bg fade-in-bg" :class="{ 'bg-loaded': fmBgLoaded }" :style="{ backgroundImage: `url(${personalFmCoverUrl})` }"></span>
          <template v-if="personalFmTracks.length">
            <span class="fm-poster-top">
              <span class="fm-top-title">私人 FM</span>
              <button
                ref="fmModeBtnRef"
                type="button"
                class="fm-mode-btn"
                :class="{ 'hover-visible': fmHovered, active: fmModePopoverOpen || playerStore.state.fmMode !== 'DEFAULT' }"
                :title="`当前模式: ${fmModeLabel}`"
                aria-label="私人 FM 模式选择"
                @click.stop="toggleFmModePopover"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                  <circle cx="12" cy="12" r="3"/>
                  <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
                </svg>
              </button>
            </span>
            <span class="fm-bottom-zone">
              <span class="fm-poster-bottom">私人 FM｜从「{{ personalFmTracks[0]?.name || '今日漫游' }}」听起</span>
              <span class="fm-control-panel" @click.stop>
                <button
                  type="button"
                  class="fm-control-btn fm-control-btn--ghost"
                  :title="fmDislikeTitle"
                  aria-label="不喜欢当前私人 FM"
                  @click.stop="dislikePersonalFm"
                >
                  <span class="fm-control-icon" v-html="dislikeIconSvg"></span>
                </button>
                <button
                  type="button"
                  class="fm-control-btn fm-control-btn--primary"
                  :title="fmPlayTitle"
                  :aria-label="fmPlayTitle"
                  @click.stop="togglePersonalFmPlayback"
                >
                  <span class="fm-control-icon" v-html="playToggleIconSvg"></span>
                </button>
                <button
                  type="button"
                  class="fm-control-btn fm-control-btn--ghost"
                  :title="fmNextTitle"
                  aria-label="下一首私人 FM"
                  @click.stop="nextPersonalFm"
                >
                  <span class="fm-control-icon" v-html="nextIconSvg"></span>
                </button>
              </span>
            </span>
            <Teleport to="body">
              <div
                v-if="fmModePopoverOpen"
                ref="fmPopoverRef"
                class="fm-mode-popover"
                :style="fmPopoverStyle"
                @click.stop
              >
                <div class="fm-mode-popover-header">选择私人 FM 模式</div>
                <div class="fm-mode-options">
                  <button
                    v-for="opt in fmModeOptions"
                    :key="opt.value"
                    type="button"
                    class="fm-mode-option"
                    :class="{ selected: selectedFmMode === opt.value }"
                    @click="selectFmMode(opt.value)"
                  >
                    <span class="fm-mode-option-radio">
                      <span v-if="selectedFmMode === opt.value" class="fm-mode-option-dot"></span>
                    </span>
                    <span class="fm-mode-option-text">
                      <span class="fm-mode-option-label">{{ opt.label }}</span>
                      <span class="fm-mode-option-desc">{{ opt.desc }}</span>
                    </span>
                  </button>
                </div>
                <div v-if="selectedFmMode === 'SCENE_RCMD'" class="fm-submode-section">
                  <div class="fm-submode-label">选择场景</div>
                  <div class="fm-submode-options">
                    <button
                      v-for="opt in fmSubmodeOptions"
                      :key="opt.value"
                      type="button"
                      class="fm-mode-option fm-submode-option"
                      :class="{ selected: selectedFmSubmode === opt.value }"
                      @click="selectFmSubmode(opt.value)"
                    >
                      <span class="fm-mode-option-radio">
                        <span v-if="selectedFmSubmode === opt.value" class="fm-mode-option-dot"></span>
                      </span>
                      <span class="fm-mode-option-text">
                        <span class="fm-mode-option-label">{{ opt.label }}</span>
                      </span>
                    </button>
                  </div>
                </div>
                <div class="fm-mode-popover-footer">
                  <button type="button" class="fm-mode-apply-btn" @click="applyFmMode">
                    确定
                  </button>
                </div>
              </div>
            </Teleport>
          </template>
          <span v-else-if="personalFmLoading" class="skeleton-text">正在获取私人 FM…</span>
          <span v-else-if="personalFmError" class="skeleton-text error">{{ personalFmError }}</span>
          <span v-else class="skeleton-text">登录后可使用私人 FM</span>
        </button>
      </AnimatedAppear>
    </AnimatedAppear>

    <AnimatedAppear tag="section" variant="content" rhythm="body" class-name="top-artists-section">
      <HorizontalScrollRail
        aria-label="热门歌手"
        content-class="top-artists-row"
        content-layout="flex"
      >
        <template v-if="topArtists.length">
          <button v-for="artist in topArtists" :key="artist.id" class="artist-chip" @click="openArtistDetail(artist)">
            <span class="artist-avatar hover-scale-image" :style="{ backgroundImage: `url(${resolveSizedImageUrl(artist.picUrl || artist.img1v1Url, 220)})` }"></span>
            <span class="artist-name">{{ artist.name }}</span>
          </button>
          <span
            ref="topArtistsSentinel"
            class="top-artists-sentinel"
            aria-hidden="true"
          ></span>
        </template>
        <span v-else-if="topArtistsLoading" class="rail-placeholder">热门歌手加载中…</span>
        <span v-else-if="topArtistsError" class="rail-placeholder">{{ topArtistsError }}</span>
      </HorizontalScrollRail>
    </AnimatedAppear>

    <AnimatedAppear tag="div" variant="content" rhythm="body" class-name="home-grid">
      <AnimatedAppear
        v-for="widget in visibleWidgets"
        :key="widget.id"
        tag="section"
        variant="content"
        rhythm="body"
        class-name="card"
        :class="widget.id"
        :ref="widget.id === 'list' ? setHotListCardRef : null"
      >

        <template v-if="widget.id === 'list'">
          <AnimatedAppear tag="h3" variant="title" rhythm="head">本周最热音乐</AnimatedAppear>
          <ul class="music-list">
            <AnimatedAppear
              v-for="(song, idx) in songs"
              :key="song.id"
              tag="li"
              variant="text"
              rhythm="list"
              :index="idx"
              class-name="song"
              :class="{ 'song-item--playing': Number(song?.id) > 0 && Number(song?.id) === Number(playerStore.state.currentSongId || 0), playing: Number(song?.id) > 0 && Number(song?.id) === Number(playerStore.state.currentSongId || 0) }"
              @dblclick="onSongRowDblClick($event, idx)"
            >
              <AnimatedAppear tag="div" variant="media" rhythm="list" :index="idx" class-name="cover hover-scale-image" :style="{ backgroundImage: `url(${song.al?.picUrl || ''})` }" />
              <div class="meta">
                <div class="name">{{ song.name }}</div>
                <div class="artist">
                  <button
                    v-for="artist in getTrackArtists(song)"
                    :key="`${song.id}-${artist.id || artist.name}`"
                    type="button"
                    class="artist-inline-btn"
                    @click.stop="openArtistDetail(artist)"
                  >
                    {{ artist.name || '未知歌手' }}
                  </button>
                  <span v-if="!getTrackArtists(song).length">未知歌手</span>
                </div>
              </div>
              <div class="ops">
                <AnimatedAppear tag="div" variant="control" rhythm="actions" :index="idx" class-name="icon-btn-wrap"><BookmarkIconButton :song-id="song.id" :liked="typeof song?.liked === 'boolean' ? song.liked : typeof song?.isLiked === 'boolean' ? song.isLiked : undefined" /></AnimatedAppear>
                <PlayPauseIconButton :song-id="Number(song?.id || 0)" @play="playSong(idx)" />
              </div>
            </AnimatedAppear>
          </ul>
          <p v-if="hotSongsLoading" class="list-hint">加载中…</p>
          <p v-else-if="!hotSongsHasMore && songs.length" class="list-hint">已经到底啦</p>
          <div :ref="setHotSongsSentinelRef" class="list-sentinel" aria-hidden="true"></div>
        </template>

        <template v-else-if="widget.id === 'albums'">
          <AnimatedAppear tag="h3" variant="title" rhythm="head">最新专辑推荐</AnimatedAppear>
          <p v-if="albumLoading" class="custom-tip">专辑加载中…</p>
          <p v-else-if="!albums.length" class="custom-tip">{{ albumLoadNote || '未获取到专辑数据' }}</p>
          <AnimatedAppear
            v-else
            tag="div"
            variant="media"
            rhythm="body"
          >
            <HorizontalScrollRail
              aria-label="最新专辑推荐"
              content-class="albums-row"
              content-layout="flex"
            >
              <div
                v-for="(group, gi) in albumGroups"
                :key="gi"
                class="albums-column"
              >
                <AnimatedAppear
                  v-for="item in group"
                  :key="item.id"
                  tag="div"
                  variant="media"
                  rhythm="list"
                  class-name="albums-card-item"
                >
                  <GradientCard
                    tag="button"
                    :cover="item.pic"
                    :name="item.name"
                    hover-play-size="sm"
                    @click="openAlbumDetail(item.id)"
                  >
                    <template #subtitle>
                      <button
                        v-for="artist in getAlbumArtists(item)"
                        :key="`${item.id}-${artist.id || artist.name}`"
                        type="button"
                        class="artist-inline-btn"
                        @click.stop="openArtistDetail(artist)"
                      >
                        {{ artist.name || '未知歌手' }}
                      </button>
                      <span v-if="!getAlbumArtists(item).length">{{ item.artist }}</span>
                    </template>
                  </GradientCard>
                </AnimatedAppear>
              </div>
            </HorizontalScrollRail>
          </AnimatedAppear>
        </template>

        <template v-else-if="widget.id === 'exclusive-recommend' && (userStore.state.loginMode === 'cookie' || userStore.state.loginMode === 'qr')">
          <AnimatedAppear tag="h3" variant="title" rhythm="head">你的专属推荐</AnimatedAppear>
          <p v-if="exclusiveRecoLoading" class="custom-tip">专属推荐加载中…</p>
          <p v-else-if="exclusiveRecoError" class="custom-tip">{{ exclusiveRecoError }}</p>
          <AnimatedAppear
            v-else
            tag="div"
            variant="media"
            rhythm="body"
          >
            <div class="exclusive-recommend-grid">
              <AnimatedAppear
                v-for="item in exclusiveRecoPlaylists.slice(0, 18)"
                :key="item.id"
                tag="div"
                variant="media"
                rhythm="list"
                class-name="albums-card-item"
              >
                <GradientCard
                  tag="button"
                  :cover="item.picUrl || ''"
                  :name="item.name"
                  hover-play-size="sm"
                  @click="openRecoDetail(item.id)"
                >
                  <template #subtitle>
                    <button
                      v-if="item.creator"
                      type="button"
                      class="artist-inline-btn"
                      @click.stop="openUserDetailById(item.creator.userId)"
                    >
                      {{ item.creator.nickname || '创建者' }}
                    </button>
                  </template>
                </GradientCard>
              </AnimatedAppear>
            </div>
          </AnimatedAppear>
        </template>

        <template v-else-if="widget.id === 'radar-playlist'">
          <AnimatedAppear tag="h3" variant="title" rhythm="head">雷达歌单</AnimatedAppear>
          <p v-if="radarPlaylistsLoading" class="custom-tip">雷达歌单加载中…</p>
          <p v-else-if="radarPlaylistsError" class="custom-tip">{{ radarPlaylistsError }}</p>
          <p v-else-if="!radarPlaylists.length" class="custom-tip">暂无雷达歌单数据</p>
          <AnimatedAppear
            v-else
            tag="div"
            variant="media"
            rhythm="body"
          >
            <HorizontalScrollRail
              aria-label="雷达歌单"
              content-class="albums-row"
              content-layout="flex"
            >
              <div
                v-for="(group, gi) in radarPlaylistGroups"
                :key="gi"
                class="albums-column"
              >
                <AnimatedAppear
                  v-for="item in group"
                  :key="item.id"
                  tag="div"
                  variant="media"
                  rhythm="list"
                  class-name="albums-card-item"
                >
                  <GradientCard
                    tag="button"
                    :cover="item.coverImgUrl || item.picUrl || ''"
                    :name="radarPlaylistNames[item.id] || item.name"
                    hover-play-size="sm"
                    @click="openRecoDetail(item.id)"
                  >
                    <template #subtitle>
                      <span class="radar-playlist-desc">{{ item.description ? item.description.slice(0, 30) : item.trackCount + '首' }}</span>
                    </template>
                  </GradientCard>
                </AnimatedAppear>
              </div>
            </HorizontalScrollRail>
          </AnimatedAppear>
        </template>

        <template v-else-if="widget.id === 'latest-music'">
          <AnimatedAppear tag="h3" variant="title" rhythm="head">新歌速递</AnimatedAppear>
          <p v-if="latestMusicLoading" class="custom-tip">最新音乐加载中…</p>
          <p v-else-if="latestMusicError" class="custom-tip">{{ latestMusicError }}</p>
          <AnimatedAppear
            v-else
            tag="div"
            variant="media"
            rhythm="body"
          >
            <HorizontalScrollRail
              ref="latestScrollRailRef"
              aria-label="新歌速递"
              content-class="latest-scroll"
              content-layout="block"
              :min-scroll="320"
              @rail-scroll="onLatestScroll"
              @rail-wheel="onLatestWheel"
            >
            <div class="latest-track">
              <div v-for="(band, bandIdx) in latestBands" :key="`band-${bandIdx}`" class="latest-band">
                <div v-for="(col, colIdx) in band" :key="`band-${bandIdx}-col-${colIdx}`" class="latest-column">
                  <AnimatedAppear
                    v-for="(song, rowIdx) in col"
                    :key="song.id"
                    tag="button"
                    variant="text" rhythm="body"
                    :index="bandIdx * 12 + colIdx * 4 + rowIdx"
                    class-name="latest-row"
                    :class="{ 'song-item--playing': Number(song?.id) > 0 && Number(song?.id) === Number(playerStore.state.currentSongId || 0) }"
                    @click="playLatestSong(song.__idx)"
                  >
                    <div class="latest-cover" :style="{ backgroundImage: `url(${song.al?.picUrl || song.album?.picUrl || ''})` }"></div>
                    <div class="latest-meta">
                      <div class="latest-name">{{ song.name }}</div>
                      <div class="latest-artist">
                        <button
                          v-for="artist in getTrackArtists(song)"
                          :key="`${song.id}-${artist.id || artist.name}`"
                          type="button"
                          class="artist-inline-btn"
                          @click.stop="openArtistDetail(artist)"
                        >
                          {{ artist.name || '未知歌手' }}
                        </button>
                        <span v-if="!getTrackArtists(song).length">{{ song.__artistDisplay || '未知歌手' }}</span>
                      </div>
                    </div>
                  </AnimatedAppear>
                </div>
              </div>
            </div>
          </HorizontalScrollRail>
          </AnimatedAppear>
        </template>

        <template v-else-if="widget.id === 'podcast'">
          <AnimatedAppear tag="h3" variant="title" rhythm="head">推荐播客</AnimatedAppear>
          <p v-if="podcastLoading" class="custom-tip">播客加载中…</p>
          <p v-else-if="podcastError" class="custom-tip">{{ podcastError }}</p>
          <AnimatedAppear v-else tag="div" variant="media" rhythm="body" class-name="podcast-grid">
            <AnimatedAppear
              v-for="(item, idx) in podcastList"
              :key="item.id"
              tag="div"
              variant="media"
              rhythm="list"
              :index="idx"
              class-name="mv-card"
              @click="openPodcast(item)"
            >
              <GradientCard
                tag="button"
                :cover="item.picUrl"
                :name="item.name"
                hover-play-size="sm"
                @click="openPodcast(item)"
              >
                <template #subtitle>
                  <span v-if="item.creatorName">{{ item.creatorName }}</span>
                </template>
              </GradientCard>
            </AnimatedAppear>
          </AnimatedAppear>
        </template>

        <template v-else-if="widget.id === 'mv'">
          <AnimatedAppear tag="h3" variant="title" rhythm="head">推荐 MV</AnimatedAppear>
          <p v-if="mvLoading" class="custom-tip">MV 加载中…</p>
          <p v-else-if="mvError" class="custom-tip">{{ mvError }}</p>
          <AnimatedAppear v-else tag="div" variant="media" rhythm="body" class-name="mv-grid">
            <AnimatedAppear
              v-for="(item, idx) in mvList"
              :key="item.id"
              tag="div"
              variant="media"
              rhythm="list"
              :index="idx"
              class-name="mv-card"
              @click="openMv(item)"
            >
              <MvHoverPoster
                :src="item.cover"
                :alt="item.name"
                :count="item.playCount"
                :index="idx"
              />
              <div class="mv-card__info">
                <div class="mv-card__name" :title="item.name">{{ item.name }}</div>
                <span v-if="item.artistName" class="mv-card__artist">{{ item.artistName }}</span>
              </div>
            </AnimatedAppear>
          </AnimatedAppear>
        </template>

        <template v-else-if="widget.id === 'search-hot'">
          <AnimatedAppear tag="h3" variant="title" rhythm="head">热搜榜</AnimatedAppear>
          <AnimatedAppear tag="ol" variant="text" rhythm="body" class-name="hot-list">
            <AnimatedAppear
              v-for="(item, idx) in hotList"
              :key="item"
              tag="li"
              variant="text"
              rhythm="list"
              :index="idx"
              class-name="hot-item"
              @click="quickSearch(item)"
            >
              <span class="rank">{{ idx + 1 }}</span>
              <span class="kw">{{ item }}</span>
            </AnimatedAppear>
          </AnimatedAppear>
        </template>

        <template v-else-if="widget.id === 'search-history'">
          <AnimatedAppear tag="h3" variant="title" rhythm="head">搜索历史</AnimatedAppear>
          <AnimatedAppear tag="div" variant="text" rhythm="body" class-name="history-tags">
            <AnimatedAppear
              v-for="item in searchHistory"
              :key="item"
              tag="button"
              variant="control"
              rhythm="list"
              class-name="tag button-surface"
              @click="quickSearch(item)"
            >
              {{ item }}
            </AnimatedAppear>
            <p v-if="!searchHistory.length" class="custom-tip">暂无搜索历史</p>
          </AnimatedAppear>
        </template>

        <template v-else-if="widget.id === 'settings-theme'">
          <AnimatedAppear tag="h3" variant="title" rhythm="head">主题模式</AnimatedAppear>
          <AnimatedAppear tag="p" variant="text" rhythm="body" class-name="custom-desc">快速切换浅色/深色/跟随系统</AnimatedAppear>
          <AnimatedAppear tag="select" variant="control" rhythm="body" class="theme-select" :value="uiStore.state.themeMode" @change="onThemeChange">
            <option value="浅色">浅色</option>
            <option value="深色">深色</option>
            <option value="跟随系统">跟随系统</option>
          </AnimatedAppear>
        </template>

        <template v-else>
          <AnimatedAppear tag="h3" variant="title" rhythm="head">{{ widget.title }}</AnimatedAppear>
          <AnimatedAppear tag="p" variant="text" rhythm="body" class-name="custom-desc">{{ widget.content }}</AnimatedAppear>
          <AnimatedAppear tag="p" variant="text" rhythm="body" :index="1" class-name="custom-tip">来自其他页面组件，可继续扩展真实内容。</AnimatedAppear>
        </template>
      </AnimatedAppear>
    </AnimatedAppear>
  </AnimatedAppear>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useBgLoaded } from '../composables/useBgLoaded';
import { apiCache } from '../stores/apiCache';
import { getArtistDetail, getPersonalFm, getPlaylistDetail, getRecommendPlaylists, getRecommendSongs, getNewestAlbums, getTopAlbums, getTopArtists, getTopSongs, searchMusic, getAllMvs, getDjRecommend, setPersonalFmMode } from '../api/music';
import { getUserCreatedPlaylist } from '../api/auth';
import { resolveSizedImageUrl } from '../utils/image';
import { usePlayerStore } from '../stores/player'
const playerStore = usePlayerStore();
import { useUiStore } from '../stores/ui';
const uiStore = useUiStore();
import { useUserStore } from '../stores/user';
const userStore = useUserStore();
import AnimatedAppear from './AnimatedAppear.vue';
import GradientCard from './ui/GradientCard.vue';
import BookmarkIconButton from './ui/BookmarkIconButton.vue';
import PlayPauseIconButton from './ui/PlayPauseIconButton.vue';
import HorizontalScrollRail from './ui/HorizontalScrollRail.vue';
import MvHoverPoster from './MvHoverPoster.vue';

const emit = defineEmits<{
  (e: 'open-detail', playlistId: number, coverUrl?: string, returnPage?: string): void;
  (e: 'open-daily-list', songs: any[]): void;
  (e: 'open-album-detail', albumId: number): void;
  (e: 'open-playlist-category', category: string): void;
  (e: 'open-search', keyword: string): void;
  (e: 'open-artist', artist: any): void;
  (e: 'open-user', userId: number): void;
  (e: 'open-mv-player', mv: any): void;
  (e: 'open-podcast-detail', podcast: any): void;
}>();
const defaultLayout = [
  { id: 'albums', x: 0, y: 2, w: 12, h: 7, title: '专辑推荐模块', content: '首页专辑推荐区域' },
  { id: 'exclusive-recommend', x: 0, y: 3, w: 12, h: 7, title: '专属推荐模块', content: '首页你的专属推荐区域' },
  { id: 'radar-playlist', x: 0, y: 4, w: 12, h: 7, title: '雷达歌单模块', content: '首页雷达歌单区域' },
  { id: 'list', x: 0, y: 9, w: 12, h: 8, title: '热门音乐模块', content: '首页热门音乐列表区域' },
  { id: 'latest-music', x: 0, y: 17, w: 12, h: 4, title: '最新音乐组件', content: '首页最新音乐卡片流' },
  { id: 'podcast', x: 0, y: 21, w: 12, h: 7, title: '推荐播客', content: '首页播客推荐区域' },
  { id: 'mv', x: 0, y: 29, w: 12, h: 9, title: '推荐 MV', content: '首页 MV 推荐区域' },
];

const widgets = ref<any[]>(JSON.parse(JSON.stringify(defaultLayout)));
const hasRealLogin = computed(() => userStore.state.loginMode === 'cookie' || userStore.state.loginMode === 'qr');
const visibleWidgets = computed(() => widgets.value.filter((widget) => widget.id !== 'exclusive-recommend' || hasRealLogin.value));

const tags = ['综艺', '流行', '影视原声', '华语', 'ACG', '摇滚', '民谣', '电子', '说唱', '轻音乐'];
const hotList = ['周杰伦', '林俊杰', '邓紫棋', '告五人', '影视原声', '华语热歌', '王菲', '陈奕迅'];
const searchHistory = ref<string[]>(JSON.parse(localStorage.getItem('tm_search_history') || '[]'));
const defaultTopArtists = ref<any[]>([]);
const topArtists = computed(() => {
  const followed = userStore.state.isLogin ? userStore.state.subscribedArtists : [];
  if (!followed.length) return defaultTopArtists.value;
  const followedIds = new Set(followed.map((artist: any) => Number(artist?.id || 0)));
  return [...followed, ...defaultTopArtists.value.filter((artist: any) => !followedIds.has(Number(artist?.id || 0)))];
});
const topArtistsLoading = ref(false);
const topArtistsError = ref('');
const topArtistsOffset = ref(0);
const topArtistsHasMore = ref(true);
const ARTISTS_PAGE_SIZE = 24;
const songs = ref<any[]>([]);
const hotSongsLoading = ref(false);
const hotSongsHasMore = ref(true);
const hotSongsOffset = ref(0);
const hotSongsLimit = 12;
const hotSongsSentinel = ref<HTMLElement | null>(null);
const hotListCardRef = ref<HTMLElement | null>(null);
let hotSongsObserver: IntersectionObserver | null = null;

function setHotListCardRef(el: any) {
  const element = el instanceof HTMLElement ? el : el?.$el instanceof HTMLElement ? el.$el : null;
  hotListCardRef.value = element;
}

function setHotSongsSentinelRef(el: any) {
  const element = el instanceof HTMLElement ? el : el?.$el instanceof HTMLElement ? el.$el : null;
  hotSongsSentinel.value = element;
}

const dailyRecommendSongs = ref<any[]>([]);
const dailyRecommendLoading = ref(false);
const dailyRecommendError = ref('');
const radarTopTracks = ref<any[]>([]);
const radarCoverUrl = ref('');
const privateRadar = ref<Array<{ id: number; name: string; picUrl?: string }>>([]);
const privateRadarLoading = ref(false);
const privateRadarError = ref('');
const publicRecoLoading = ref(false);
const publicRecoError = ref('');
const dailyRecommendCoverUrl = computed(() => dailyRecommendSongs.value[0]?.al?.picUrl || dailyRecommendSongs.value[0]?.album?.picUrl || dailyRecommendSongs.value[0]?.album?.blurPicUrl || dailyRecommendSongs.value[0]?.picUrl || dailyRecommendSongs.value[0]?.coverImgUrl || '');
const dailyRecommendHeroTitle = computed(() => dailyRecommendSongs.value[0]?.name || '每日推荐');
const dailyRecommendHeroSubtitle = computed(() => dailyRecommendSongs.value[0]?.ar?.map((a: any) => a.name).join('/') || '每日为你更新的歌曲');
const dailyRecommendTracks = computed(() => dailyRecommendSongs.value.slice(0, 3));
const isUidLogin = computed(() => userStore.state.loginMode === 'uid');
const publicRecoPlaylists = ref<Array<{ id: number; name: string; coverImgUrl?: string; picUrl?: string; creator?: any }>>([]);
const publicRecoTracks = ref<any[]>([]);
const publicRecoCoverUrl = ref('');
/** 私人雷达歌单 ID 固定值，不依赖 API 返回结果 */
const PRIVATE_RADAR_ID = 3136952023;
const dailyRecoRadar = computed(() => ({
  id: PRIVATE_RADAR_ID,
  name: '私人雷达',
  picUrl: '',
  coverImgUrl: '',
}));
const topRecoCard = computed(() => (isUidLogin.value ? publicRecoPlaylists.value[0] || null : dailyRecoRadar.value));
const topRecoTracks = computed(() => (isUidLogin.value ? publicRecoTracks.value : radarTopTracks.value));
const topRecoCardTitle = computed(() => (isUidLogin.value ? '我的喜欢' : '私人雷达'));
const topRecoCardSubtitle = computed(() => {
  const fallback = isUidLogin.value ? '当前账号的公开创建歌单' : '你的偏好音乐';
  return `${topRecoCardTitle.value}｜从「${topRecoTracks.value[0]?.name || fallback}」听起`;
});
const topRecoCardCoverUrl = computed(() => (
  isUidLogin.value
    ? userStore.state.profile?.avatarUrl || publicRecoCoverUrl.value || topRecoCard.value?.coverImgUrl || topRecoCard.value?.picUrl || ''
    : radarCoverUrl.value
));
const topRecoLoading = computed(() => (isUidLogin.value ? publicRecoLoading.value : privateRadarLoading.value));
const topRecoError = computed(() => (isUidLogin.value ? publicRecoError.value : privateRadarError.value));
const topRecoEmptyText = computed(() => (isUidLogin.value ? '该用户暂未公开创建歌单' : '暂无推荐内容'));
const personalFmTracks = ref<any[]>([]);
const personalFmLoading = ref(false);
const personalFmError = ref('');
const personalFmCoverUrl = computed(() => {
  const first = personalFmTracks.value[0];
  return first?.album?.picUrl || first?.al?.picUrl || first?.artists?.[0]?.img1v1Url || '';
});

const dailyBgLoaded = useBgLoaded(() => dailyRecommendCoverUrl.value);
const topRecoBgLoaded = useBgLoaded(() => topRecoCardCoverUrl.value);
const fmBgLoaded = useBgLoaded(() => personalFmCoverUrl.value);
const fmControlColor = computed(() => playerStore.state.themePrimary || 'var(--theme-primary)');
const fmControlContrastColor = computed(() => (playerStore.state.isDarkMode ? 'rgba(255, 255, 255, 0.96)' : 'rgba(255, 255, 255, 0.92)'));
const isPersonalFmCurrentTrack = computed(() => playerStore.isPersonalFmTrack(playerStore.state.currentTrack));
const isPersonalFmPlaying = computed(() => isPersonalFmCurrentTrack.value && playerStore.state.isPlaying);
const playToggleIconSvg = computed(() => {
  const fill = isPersonalFmPlaying.value ? fmControlContrastColor.value : fmControlColor.value;
  return isPersonalFmPlaying.value
    ? `<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="6" y="5" width="4" height="14" rx="1.5" fill="${fill}" /><rect x="14" y="5" width="4" height="14" rx="1.5" fill="${fill}" /></svg>`
    : `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 6.5v11a1 1 0 0 0 1.53.848l8.5-5.5a1 1 0 0 0 0-1.696l-8.5-5.5A1 1 0 0 0 8 6.5Z" fill="${fill}" /></svg>`;
});
const dislikeIconSvg = computed(() => {
  const stroke = fmControlColor.value;
  return `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10.8 5.5H6.9c-.93 0-1.74.64-1.95 1.54l-1.14 4.9a2 2 0 0 0 1.95 2.46h3.38l-.53 3.92a1.85 1.85 0 0 0 3.4 1.18l4.3-6.14c.2-.28.3-.62.3-.97V7.4a1.9 1.9 0 0 0-1.9-1.9h-3.9Zm7.15 0h1.65A1.4 1.4 0 0 1 21 6.9v6.95a1.4 1.4 0 0 1-1.4 1.4h-1.65V5.5Z" fill="none" stroke="${stroke}" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
});
const nextIconSvg = computed(() => {
  const stroke = fmControlColor.value;
  return `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6.75v10.5a.85.85 0 0 0 1.34.7L15 12.7a.85.85 0 0 0 0-1.4L7.34 6.05A.85.85 0 0 0 6 6.75Zm10.75-.25v11" fill="none" stroke="${stroke}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
});
const fmPlayTitle = computed(() => (isPersonalFmPlaying.value ? '暂停私人 FM' : '播放私人 FM'));
const fmDislikeTitle = computed(() => '不喜欢并切换下一首');

// ---- FM 模式选择 ----
const fmModeOptions = [
  { value: 'DEFAULT', label: '默认', desc: '基于你的听歌习惯推荐' },
  { value: 'FAMILIAR', label: '熟悉', desc: '推荐你熟悉的曲风' },
  { value: 'EXPLORE', label: '探索', desc: '探索更多新音乐' },
  { value: 'SCENE_RCMD', label: '场景推荐', desc: '根据场景推荐音乐' },
  { value: 'aidj', label: 'AI DJ', desc: 'AI 驱动个性化推荐' },
];
const fmSubmodeOptions = [
  { value: 'EXERCISE', label: '运动' },
  { value: 'FOCUS', label: '专注' },
  { value: 'NIGHT_EMO', label: '深夜' },
];
const fmModePopoverOpen = ref(false);
const fmHovered = ref(false);
const selectedFmMode = ref(playerStore.state.fmMode);
const selectedFmSubmode = ref(playerStore.state.fmSubmode);
const fmModeBtnRef = ref<HTMLElement | null>(null);
const fmPopoverRef = ref<HTMLElement | null>(null);
const fmPopoverStyle = ref({ top: '0px', left: '0px' });

const fmModeLabel = computed(() => {
  if (playerStore.state.fmMode === 'DEFAULT' && !playerStore.state.fmSubmode) return '默认';
  const opt = fmModeOptions.find(o => o.value === playerStore.state.fmMode);
  if (playerStore.state.fmMode === 'SCENE_RCMD' && playerStore.state.fmSubmode) {
    const sub = fmSubmodeOptions.find(o => o.value === playerStore.state.fmSubmode);
    return `${opt?.label || '场景'}·${sub?.label || ''}`;
  }
  return opt?.label || playerStore.state.fmMode;
});

function toggleFmModePopover() {
  if (fmModePopoverOpen.value) {
    fmModePopoverOpen.value = false;
    return;
  }
  selectedFmMode.value = playerStore.state.fmMode;
  selectedFmSubmode.value = playerStore.state.fmSubmode;
  fmModePopoverOpen.value = true;
  nextTick(() => updateFmPopoverPosition());
}

function selectFmMode(mode: string) {
  selectedFmMode.value = mode;
  if (mode !== 'SCENE_RCMD') {
    selectedFmSubmode.value = '';
  } else if (!selectedFmSubmode.value) {
    selectedFmSubmode.value = 'EXERCISE';
  }
  nextTick(() => updateFmPopoverPosition());
}

function selectFmSubmode(submode: string) {
  selectedFmSubmode.value = submode;
}

function updateFmPopoverPosition() {
  if (!fmModeBtnRef.value) return;
  const rect = fmModeBtnRef.value.getBoundingClientRect();
  const isNarrow = window.innerWidth <= 560;
  if (isNarrow) {
    fmPopoverStyle.value = {
      top: `${rect.bottom + 8}px`,
      left: '16px',
    };
  } else {
    const popoverWidth = 240;
    let left = rect.left - popoverWidth + rect.width;
    if (left < 8) left = 8;
    const maxLeft = window.innerWidth - popoverWidth - 8;
    if (left > maxLeft) left = maxLeft;
    fmPopoverStyle.value = {
      top: `${rect.bottom + 8}px`,
      left: `${left}px`,
    };
  }
}

async function applyFmMode() {
  fmModePopoverOpen.value = false;
  const mode = selectedFmMode.value;
  const submode = selectedFmSubmode.value;

  playerStore.setFmMode(mode, submode);

  try {
    const cookie = userStore.state.loginCookie || undefined;
    const { data } = await setPersonalFmMode({ mode, submode: submode || undefined, cookie });
    const tracks = (data?.data || []) as any[];
    // 立即停止当前播放
    playerStore.pausePlayback();

    if (tracks.length) {
      personalFmTracks.value = tracks;
      playerStore.setPersonalFmFetcher(() =>
        setPersonalFmMode({ mode, submode: submode || undefined, cookie }).then(r => r?.data?.data || [])
      );
      playerStore.state.personalFmHasMore = true;
      playerStore.setPersonalFmPlaylist(tracks, 0);
      await playerStore.playByIndex(0);
      syncPersonalFmViewFromPlayer();
    } else {
      // 无曲目返回时清空 FM 上下文，停止播放
      playerStore.clearPersonalFmContext();
      playerStore.setPlaylist([], 0);
      personalFmTracks.value = [];
      personalFmError.value = '该模式下暂无可用曲目';
    }
  } catch (e: any) {
    personalFmError.value = e?.message || '切换 FM 模式失败';
  }
}

function onFmPopoverDocClick(e: MouseEvent) {
  if (!fmModePopoverOpen.value) return;
  const target = e.target as Node;
  if (
    fmModeBtnRef.value?.contains(target) ||
    fmPopoverRef.value?.contains(target)
  ) return;
  fmModePopoverOpen.value = false;
}

function onFmPopoverKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') fmModePopoverOpen.value = false;
}
const fmNextTitle = computed(() => '下一首私人 FM');
const albums = ref<Array<{ id: number; name: string; artist: string; pic: string }>>([]);
const albumLoading = ref(false);
const albumLoadNote = ref('');
const albumGroups = computed(() => {
  const groups: any[] = [];
  for (let i = 0; i < albums.value.length; i += 2) {
    groups.push([albums.value[i], albums.value[i + 1]].filter(Boolean));
  }
  return groups;
});
const exclusiveRecoPlaylists = computed(() => privateRadar.value);

const exclusiveRecoLoading = computed(() => privateRadarLoading.value);
const exclusiveRecoError = computed(() => privateRadarError.value);

// 雷达歌单 - 硬编码官方歌单ID
const RADAR_PLAYLIST_IDS = [
  3136952023,    // 私人雷达
  2829896389,    // 日系私人雷达
  2829816518,    // 欧美私人雷达
  2829883282,    // 华语私人雷达
  2829920189,    // 韩系私人雷达
  5320167908,    // 时光雷达
  8402996200,    // 会员雷达
  5327906368,    // 乐迷雷达
  5362359247,    // 宝藏雷达
  13139913381,   // 新歌雷达
  13145008655,   // 云村高分雷达
  5341776086,    // 神秘雷达
  13146632040,   // 热单雷达
  10106461201,   // 从[蜘蛛糸モノポリー]开始重温经典
];
const radarPlaylistNames: Record<number, string> = {
  3136952023: '私人雷达',
  2829896389: '日系私人雷达',
  2829816518: '欧美私人雷达',
  2829883282: '华语私人雷达',
  2829920189: '韩系私人雷达',
  5320167908: '时光雷达',
  8402996200: '会员雷达',
  5327906368: '乐迷雷达',
  5362359247: '宝藏雷达',
  13139913381: '新歌雷达',
  13145008655: '云村高分雷达',
  5341776086: '神秘雷达',
  13146632040: '热单雷达',
  10106461201: '重温经典',
};
const radarPlaylists = ref<any[]>([]);
const radarPlaylistsLoading = ref(false);
const radarPlaylistsError = ref('');

async function fetchRadarPlaylists() {
  const cacheKey = 'home:radarPlaylists';
  const cached = apiCache.get(cacheKey);
  if (cached?.data) {
    radarPlaylists.value = cached.data;
    radarPlaylistsLoading.value = false;
    return;
  }
  radarPlaylistsLoading.value = true;
  radarPlaylistsError.value = '';
  try {
    const results = await Promise.allSettled(
      RADAR_PLAYLIST_IDS.map((id) => getPlaylistDetail(id, 0))
    );
    radarPlaylists.value = results
      .map((r) => (r.status === 'fulfilled' ? r.value?.data?.playlist : null))
      .filter(Boolean);
    if (radarPlaylists.value.length) {
      apiCache.set(cacheKey, radarPlaylists.value, 300000);
    }
    if (!radarPlaylists.value.length) {
      radarPlaylistsError.value = '雷达歌单获取失败';
    }
  } catch (e: any) {
    radarPlaylists.value = [];
    radarPlaylistsError.value = e?.message || '雷达歌单获取失败';
  } finally {
    radarPlaylistsLoading.value = false;
  }
}
const radarPlaylistGroups = computed(() => {
  const groups: any[] = [];
  for (let i = 0; i < radarPlaylists.value.length; i += 2) {
    groups.push([radarPlaylists.value[i], radarPlaylists.value[i + 1]].filter(Boolean));
  }
  return groups;
});

const mvList = ref<any[]>([]);
const mvLoading = ref(false);
const mvError = ref('');
const podcastList = ref<any[]>([]);
const podcastLoading = ref(false);
const podcastError = ref('');
const latestSongs = ref<any[]>([]);
const latestMusicLoading = ref(false);
const latestMusicError = ref('');
const latestMusicType = ref<0 | 7 | 96 | 8 | 16>(0);
const latestSongsLimit = 12;
const latestSongsOffset = ref(0);
const latestSongsHasMore = ref(true);
const latestLoadingMore = ref(false);
const latestScrollRailRef = ref<InstanceType<typeof HorizontalScrollRail> | null>(null);
const latestSongSource = ref<any[]>([]);
const latestArtistNameCache = new Map<number, string>();
const topArtistsSentinel = ref<HTMLElement | null>(null);
const latestBands = computed(() => {
  const bandSize = 12;
  const cols = 3;
  const result: any[][][] = [];
  for (let offset = 0; offset < latestSongs.value.length; offset += bandSize) {
    const chunk = latestSongs.value.slice(offset, offset + bandSize);
    const perCol = Math.max(1, Math.ceil(chunk.length / cols));
    const band = Array.from({ length: cols }, (_, i) => chunk.slice(i * perCol, (i + 1) * perCol)).filter((col) => col.length);
    if (band.length) result.push(band);
  }
  return result;
});
let latestScrollRaf = 0;
let latestWheelRaf = 0;
let latestWheelDelta = 0;


async function loadMoreHotSongs() {
  if (hotSongsLoading.value || !hotSongsHasMore.value) return;

  hotSongsLoading.value = true;
  try {
    const data = await searchMusic('华语 热门', { limit: hotSongsLimit, offset: hotSongsOffset.value });
    const incoming = (data?.result?.songs || []) as any[];
    const existingIds = new Set(songs.value.map((s) => s.id));
    const uniqueIncoming = incoming.filter((s) => !existingIds.has(s.id));

    songs.value = [...songs.value, ...uniqueIncoming];
    hotSongsOffset.value += incoming.length;
    hotSongsHasMore.value = incoming.length >= hotSongsLimit;
  } catch {
    hotSongsHasMore.value = false;
  } finally {
    hotSongsLoading.value = false;
  }
}

function setupHotSongsObserver() {
  const target = hotSongsSentinel.value;
  if (!(target instanceof Element)) return;
  if (hotSongsObserver) hotSongsObserver.disconnect();

  const rootCandidate = hotListCardRef.value;
  const validRoot = rootCandidate instanceof Element || rootCandidate instanceof Document ? rootCandidate : null;

  hotSongsObserver = new IntersectionObserver(
    (entries) => {
      const entry = entries[0];
      if (entry?.isIntersecting) {
        void loadMoreHotSongs();
      }
    },
    {
      root: validRoot,
      threshold: 0,
      rootMargin: '80px 0px 80px 0px',
    },
  );

  hotSongsObserver.observe(target);
}

async function fetchRadarPlaylistDetail() {
  const id = PRIVATE_RADAR_ID;
  if (!id) {
    radarTopTracks.value = [];
    radarCoverUrl.value = '';
    return;
  }

  try {
    // 必须传递 cookie，否则 API 可能返回非登录用户的默认/缓存数据（私人雷达是用户专属歌单）
    const { data } = await getPlaylistDetail(id, 8, userStore.state.loginCookie || undefined);
    const playlist = data?.playlist;
    radarTopTracks.value = (playlist?.tracks || []).slice(0, 8);
    // 调试：确认获取到的是正确歌单
    console.log('[RadarDetail] id=', id, 'name=', playlist?.name, 'firstTrack=', radarTopTracks.value[0]?.name, 'trackCount=', playlist?.tracks?.length);

    const trackCover =
      playlist?.tracks?.[0]?.al?.picUrl ||
      playlist?.tracks?.[0]?.album?.picUrl ||
      playlist?.coverImgUrl ||
      playlist?.coverUrl ||
      playlist?.blurCoverImgUrl ||
      '';

    radarCoverUrl.value = trackCover;
    // 缓存歌曲级封面，后续缓存命中时可直接恢复，避免先显示歌单封面再闪烁切换
    apiCache.set('radar:coverUrl', trackCover, dailyTtl());
  } catch {
    radarTopTracks.value = [];
    radarCoverUrl.value = '';
    console.warn('[RadarDetail] fetch failed for id=', id);
  }
}

async function fetchPublicRecoPlaylistDetail() {
  const playlist = publicRecoPlaylists.value[0];
  if (!playlist?.id) {
    publicRecoTracks.value = [];
    publicRecoCoverUrl.value = '';
    return;
  }

  try {
    const { data } = await getPlaylistDetail(playlist.id, 8);
    const detail = data?.playlist;
    publicRecoTracks.value = (detail?.tracks || []).slice(0, 8);
    publicRecoCoverUrl.value =
      detail?.coverImgUrl ||
      detail?.coverUrl ||
      detail?.blurCoverImgUrl ||
      detail?.tracks?.[0]?.al?.picUrl ||
      playlist.coverImgUrl ||
      playlist.picUrl ||
      '';
  } catch {
    publicRecoTracks.value = [];
    publicRecoCoverUrl.value = playlist.coverImgUrl || playlist.picUrl || '';
  }
}

async function fetchPublicRecoPlaylists() {
  if (!userStore.state.isLogin || !isUidLogin.value || !userStore.state.profile?.userId) {
    publicRecoPlaylists.value = [];
    publicRecoTracks.value = [];
    publicRecoCoverUrl.value = '';
    publicRecoError.value = '';
    publicRecoLoading.value = false;
    return;
  }

  publicRecoLoading.value = true;
  publicRecoError.value = '';

  try {
    const { data } = await getUserCreatedPlaylist(userStore.state.profile.userId, 8, 0);
    const list = Array.isArray(data?.playlist)
      ? data.playlist
      : Array.isArray(data?.list)
        ? data.list
        : Array.isArray(data?.data?.playlist)
          ? data.data.playlist
          : [];
    const uid = userStore.state.profile?.userId;
    const createdList = uid ? list.filter((item: any) => Number((item as any).creator?.userId || item?.userId || 0) === Number(uid)) : list;

    publicRecoPlaylists.value = createdList
      .filter((item: any) => Number(item?.id || 0) > 0)
      .map((item: any) => ({
        ...item,
        creator: item?.creator || userStore.state.profile || null,
      }));

    await fetchPublicRecoPlaylistDetail();

    if (!publicRecoPlaylists.value.length) {
      publicRecoError.value = '该用户暂未公开创建歌单';
    }
  } catch (e: any) {
    publicRecoPlaylists.value = [];
    publicRecoTracks.value = [];
    publicRecoCoverUrl.value = '';
    publicRecoError.value = e?.message || '公开歌单获取失败，请稍后重试';
  } finally {
    publicRecoLoading.value = false;
  }
}

/** 计算到次日 6:00 的毫秒数（每日推荐/雷达缓存到期时间） */
function dailyTtl(): number {
  const now = Date.now();
  const next = new Date();
  next.setDate(next.getDate() + 1);
  next.setHours(6, 0, 0, 0);
  return Math.max(next.getTime() - now, 60 * 60 * 1000);
}

async function fetchDailyRecommendPlaylists() {
  // 每日更新数据：检查缓存
  const cached = apiCache.get('daily:playlists');
  if (cached?.data) {
    privateRadar.value = cached.data;
    privateRadarLoading.value = false;
    // 缓存命中时，从子缓存恢复歌曲级封面，避免先显示歌单封面再闪烁切换
    const cachedCover = apiCache.get('radar:coverUrl');
    if (cachedCover?.data) {
      radarCoverUrl.value = cachedCover.data;
    }
    return;
  }

  privateRadarLoading.value = true;
  privateRadarError.value = '';

  try {
    const { data } = await getRecommendPlaylists(userStore.state.loginCookie || undefined);
    const list = data?.recommend || [];
    privateRadar.value = list;
    apiCache.set('daily:playlists', list, dailyTtl());
  } catch (e: any) {
    privateRadar.value = [];
    radarTopTracks.value = [];
    radarCoverUrl.value = '';
    privateRadarError.value = e?.message || '私人雷达歌单获取失败，请稍后重试';
  } finally {
    privateRadarLoading.value = false;
  }
}

async function fetchDailyRecommendSongs() {
  // 每日更新数据：检查缓存
  const cached = apiCache.get('daily:songs');
  if (cached?.data) {
    dailyRecommendSongs.value = cached.data;
    playerStore.state.defaultPlaylist = cached.data;
    dailyRecommendLoading.value = false;
    return;
  }

  dailyRecommendLoading.value = true;
  dailyRecommendError.value = '';
  try {
    const { data } = await getRecommendSongs(userStore.state.loginCookie || undefined);
    const list = Array.isArray(data?.recommend) ? data.recommend : Array.isArray(data?.songs) ? data.songs : Array.isArray(data?.data) ? data.data : Array.isArray(data?.data?.dailySongs) ? data.data.dailySongs : Array.isArray(data?.data?.recommend) ? data.data.recommend : Array.isArray(data?.data?.songs) ? data.data.songs : Array.isArray(data?.result?.songs) ? data.result.songs : [];
    dailyRecommendSongs.value = list;
    playerStore.state.defaultPlaylist = list;
    apiCache.set('daily:songs', list, dailyTtl());
  } catch (e: any) {
    console.error('[HomePanel][recommend/songs] request failed', e);
    dailyRecommendSongs.value = [];
    dailyRecommendError.value = e?.message || '每日推荐加载失败，请稍后重试';
  } finally {
    dailyRecommendLoading.value = false;
  }
}

async function requestPersonalFmBatch() {
  const { data } = await getPersonalFm(userStore.state.loginCookie || undefined);
  return (data?.data || []) as any[];
}

let topArtistsObserver: IntersectionObserver | null = null;

function setupTopArtistsObserver() {
  if (topArtistsObserver) topArtistsObserver.disconnect();
  const sentinel = topArtistsSentinel.value;
  if (!(sentinel instanceof Element)) return;

  topArtistsObserver = new IntersectionObserver(
    (entries) => {
      if (entries[0]?.isIntersecting && !topArtistsLoading.value && topArtistsHasMore.value) {
        loadMoreTopArtists();
      }
    },
    { root: sentinel.closest('.horizontal-scroll-rail__content'), threshold: 0.1 },
  );
  topArtistsObserver.observe(sentinel);
}

function syncPersonalFmViewFromPlayer() {
  if (playerStore.state.personalFmTrackIds.length) {
    const ids = new Set(playerStore.state.personalFmTrackIds);
    const fmPlaylist = playerStore.state.playlist.filter((track) => ids.has(Number(track?.id || 0)));
    if (fmPlaylist.length) {
      personalFmTracks.value = fmPlaylist;
      return;
    }
  }
}

async function fetchPersonalFm() {
  personalFmLoading.value = true;
  personalFmError.value = '';

  try {
    playerStore.setPersonalFmFetcher(requestPersonalFmBatch);
    const batch = await requestPersonalFmBatch();
    personalFmTracks.value = batch;
    playerStore.state.personalFmHasMore = batch.length > 0;
    playerStore.persist();
    if (!personalFmTracks.value.length) {
      personalFmError.value = '暂未获取到私人 FM 内容';
    }
  } catch (e: any) {
    personalFmTracks.value = [];
    playerStore.state.personalFmHasMore = false;
    playerStore.persist();
    personalFmError.value = e?.message || '私人 FM 获取失败，请稍后重试';
  } finally {
    personalFmLoading.value = false;
  }
}

function normalizeAlbums(list: any[]) {
  return list
    .map((item: any) => ({
      id: item.id,
      name: item.name,
      artist: item.artist?.name || item.artists?.map((a: any) => a.name).join('/') || item.ar?.map((a: any) => a.name).join('/') || '未知歌手',
      pic: item.picUrl || item.blurPicUrl || item.al?.picUrl || '',
    }))
    .filter((x: any) => x.id && x.name);
}

async function resolveArtistDisplay(song: any) {
  const fallbackArtist = song.ar?.map((a: any) => a.name).join('/') || song.artist?.name || song.artists?.map((a: any) => a.name).join('/') || '';
  const artistId = song.ar?.[0]?.id || song.artist?.id || song.artists?.[0]?.id;

  if (!artistId) return fallbackArtist || '未知歌手';

  if (latestArtistNameCache.has(artistId)) {
    return latestArtistNameCache.get(artistId) || fallbackArtist || '未知歌手';
  }

  try {
    const { data: artistData } = await getArtistDetail(artistId);
    const officialName = artistData?.data?.artist?.name || artistData?.artist?.name || fallbackArtist || '未知歌手';
    latestArtistNameCache.set(artistId, officialName);
    return officialName;
  } catch {
    return fallbackArtist || '未知歌手';
  }
}

/** 并发池：同时最多运行 concurrency 个异步任务 */
async function asyncPool<T, R>(items: T[], concurrency: number, fn: (item: T, idx: number) => Promise<R>): Promise<R[]> {
  const results: R[] = [];
  const executing: Promise<void>[] = [];
  for (let i = 0; i < items.length; i++) {
    const p = fn(items[i], i).then(r => { results[i] = r; });
    executing.push(p.then(() => executing.splice(executing.indexOf(p), 1)));
    if (executing.length >= concurrency) {
      await Promise.race(executing);
    }
  }
  await Promise.all(executing);
  return results;
}

async function normalizeLatestSongs(list: any[], baseOffset: number) {
  const limited = list.slice(0, latestSongsLimit);
  const results = await asyncPool(limited, 4, async (song: any, idx: number) => ({
    ...song,
    __artistDisplay: await resolveArtistDisplay(song),
    __idx: baseOffset + idx,
  }));
  return results;
}

function splitLatestColumns(page: any[]) {
  const colCount = 3;
  const perCol = Math.ceil(page.length / colCount);
  return Array.from({ length: colCount }, (_, c) => page.slice(c * perCol, (c + 1) * perCol)).filter((col) => col.length);
}

async function loadMoreLatestSongs() {
  if (latestLoadingMore.value || !latestSongsHasMore.value) return;

  latestLoadingMore.value = true;
  try {
    const chunk = latestSongSource.value.slice(latestSongsOffset.value, latestSongsOffset.value + latestSongsLimit);
    const normalized = await normalizeLatestSongs(chunk, latestSongs.value.length);

    latestSongs.value = [...latestSongs.value, ...normalized];
    latestSongsOffset.value += chunk.length;
    latestSongsHasMore.value = latestSongsOffset.value < latestSongSource.value.length;
  } catch (e: any) {
    latestMusicError.value = e?.message || '新歌速递获取失败，请稍后重试';
    latestSongsHasMore.value = false;
  } finally {
    latestLoadingMore.value = false;
  }
}

function setTopArtistsSentinelRef(el: any) {
  const element = el instanceof HTMLElement ? el : el?.$el instanceof HTMLElement ? el.$el : null;
  topArtistsSentinel.value = element;
  if (element) {
    setupTopArtistsObserver();
  }
}

function prefetchLatestIfNeeded(root: HTMLElement) {
  if (latestLoadingMore.value || !latestSongsHasMore.value) return;
  const remain = root.scrollWidth - root.clientWidth - root.scrollLeft;
  if (remain < 320) {
    void loadMoreLatestSongs();
  }
}

function onLatestScroll(_event: Event, root: HTMLElement) {
  if (latestScrollRaf) return;

  latestScrollRaf = requestAnimationFrame(() => {
    latestScrollRaf = 0;
    prefetchLatestIfNeeded(root);
  });
}

function onLatestWheel(e: WheelEvent, root: HTMLElement) {
  latestWheelDelta += Math.abs(e.deltaY) > Math.abs(e.deltaX) ? e.deltaY : e.deltaX;

  if (latestWheelRaf) return;

  latestWheelRaf = requestAnimationFrame(() => {
    latestWheelRaf = 0;
    if (!latestWheelDelta) return;
    root.scrollLeft += latestWheelDelta;
    latestWheelDelta = 0;
    prefetchLatestIfNeeded(root);
  });
}

async function fetchLatestMusic() {
  const cacheKey = 'home:latestMusic';
  const cached = apiCache.get(cacheKey);
  if (cached?.data) {
    latestSongs.value = cached.data.songs;
    latestSongSource.value = cached.data.source;
    latestMusicLoading.value = false;
    return;
  }
  latestMusicLoading.value = true;
  latestMusicError.value = '';
  latestSongs.value = [];
  latestSongsOffset.value = 0;
  latestSongsHasMore.value = true;
  latestSongSource.value = [];

  try {
    const { data } = await getTopSongs(latestMusicType.value);
    latestSongSource.value = (data?.data || []) as any[];

    await loadMoreLatestSongs();
    if (latestSongsHasMore.value) {
      await loadMoreLatestSongs();
    }

    if (latestSongs.value.length) {
      apiCache.set(cacheKey, { songs: latestSongs.value, source: latestSongSource.value }, 300000);
    }

    if (!latestSongs.value.length) {
      latestMusicError.value = '暂未获取到新歌速递';
    }

    nextTick(() => {
      if (typeof latestScrollRailRef.value?.scrollToStart === 'function') { latestScrollRailRef.value.scrollToStart(); }
    });
  } catch (e: any) {
    latestSongs.value = [];
    latestSongSource.value = [];
    latestMusicError.value = e?.message || '新歌速递获取失败，请稍后重试';
  } finally {
    latestMusicLoading.value = false;
  }
}

async function fetchTopArtists() {
  const cacheKey = 'home:topArtists';
  const cached = apiCache.get(cacheKey);
  if (cached?.data) {
    defaultTopArtists.value = cached.data;
    topArtistsOffset.value = defaultTopArtists.value.length;
    topArtistsHasMore.value = defaultTopArtists.value.length >= ARTISTS_PAGE_SIZE;
    topArtistsLoading.value = false;
    if (topArtistsHasMore.value) loadMoreTopArtists();
    return;
  }
  topArtistsLoading.value = true;
  topArtistsError.value = '';

  try {
    const { data } = await getTopArtists({ limit: ARTISTS_PAGE_SIZE, offset: 0 });
    const list = (data?.artists || data?.data?.artists || data?.list || []);
    defaultTopArtists.value = list;
    topArtistsOffset.value = list.length;
    topArtistsHasMore.value = list.length >= ARTISTS_PAGE_SIZE;
    if (defaultTopArtists.value.length) {
      apiCache.set(cacheKey, defaultTopArtists.value, 600000);
    }
    if (!defaultTopArtists.value.length) {
      topArtistsError.value = '暂未获取到热门歌手';
    }
  } catch (e: any) {
    defaultTopArtists.value = [];
    topArtistsError.value = e?.message || '热门歌手获取失败，请稍后重试';
  } finally {
    topArtistsLoading.value = false;
  }
  // 首屏加载完成后立即预加载下一页，确保滑动到末端时数据已就位
  if (topArtistsHasMore.value) {
    loadMoreTopArtists();
  }
}

async function loadMoreTopArtists() {
  if (topArtistsLoading.value || !topArtistsHasMore.value) return;
  topArtistsLoading.value = true;
  try {
    const { data } = await getTopArtists({ limit: ARTISTS_PAGE_SIZE, offset: topArtistsOffset.value });
    const list = (data?.artists || data?.data?.artists || data?.list || []);
    if (!list.length) {
      topArtistsHasMore.value = false;
      return;
    }
    const existingIds = new Set(defaultTopArtists.value.map((a) => a.id));
    const unique = list.filter((a) => !existingIds.has(a.id));
    defaultTopArtists.value = [...defaultTopArtists.value, ...unique];
    topArtistsOffset.value += list.length;
    topArtistsHasMore.value = list.length >= ARTISTS_PAGE_SIZE;
  } catch {
    // 静默失败，保留已有数据
  } finally {
    topArtistsLoading.value = false;
    if (topArtistsHasMore.value) {
      requestAnimationFrame(() => setupTopArtistsObserver());
    }
  }
}

async function fetchTopAlbums() {
  const cacheKey = 'home:topAlbums';
  const cached = apiCache.get(cacheKey);
  if (cached?.data) {
    albums.value = cached.data;
    albumLoading.value = false;
    return;
  }
  albumLoading.value = true;
  albumLoadNote.value = '';

  try {
    const now = new Date();
    const topResp = await getTopAlbums({
      area: 'ALL',
      type: 'new',
      year: now.getFullYear(),
      month: now.getMonth() + 1,
      limit: 12,
      offset: 0,
    });

    const topData = topResp?.data || {};
    const topPayload = topData?.monthData || topData?.weekData || topData?.data?.monthData || topData?.data?.weekData || [];
    albums.value = normalizeAlbums(topPayload).slice(0, 12);

    if (albums.value.length) {
      albumLoadNote.value = '来源：/top/album';
      apiCache.set(cacheKey, albums.value, 600000);
      return;
    }

    const newestResp = await getNewestAlbums();
    const newestData = newestResp?.data || {};
    const newestPayload = newestData?.albums || newestData?.data?.albums || newestData?.result?.albums || [];
    albums.value = normalizeAlbums(newestPayload).slice(0, 12);
    if (albums.value.length) {
      albumLoadNote.value = '来源：/album/newest';
      apiCache.set(cacheKey, albums.value, 600000);
      return;
    }

    const songFallback = await searchMusic('新歌 热门', { limit: 60, offset: 0 });
    const songAlbums = (songFallback?.result?.songs || []).map((s: any) => s.al || s.album).filter(Boolean);
    const uniq = new Map<number, any>();
    songAlbums.forEach((al: any) => {
      if (al?.id && !uniq.has(al.id)) uniq.set(al.id, al);
    });
    albums.value = Array.from(uniq.values())
      .map((al: any) => ({
        id: al.id,
        name: al.name,
        artist: al.artist?.name || al.artists?.map((a: any) => a.name).join('/') || '未知歌手',
        pic: al.picUrl || al.blurPicUrl || '',
      }))
      .filter((x: any) => x.id && x.name)
      .slice(0, 12);

    if (albums.value.length) {
      albumLoadNote.value = '来源：搜索兜底';
      apiCache.set(cacheKey, albums.value, 300000);
      return;
    }

    albums.value = [
      { id: 1, name: '暂无可用专辑数据', artist: '请检查后端 API', pic: '' },
    ];
    albumLoadNote.value = '接口返回为空（/top/album 与兜底均为空）';
  } catch {
    albums.value = [
      { id: 1, name: '专辑接口请求失败', artist: '请检查 API 服务', pic: '' },
    ];
    albumLoadNote.value = '请求失败：请确认后端已开启并支持 /top/album';
  } finally {
    albumLoading.value = false;
  }
}

async function fetchMvList() {
  const cacheKey = 'home:mvList';
  const cached = apiCache.get(cacheKey);
  if (cached?.data) {
    mvList.value = cached.data;
    mvLoading.value = false;
    return;
  }
  mvLoading.value = true;
  mvError.value = '';
  try {
    const { data } = await getAllMvs({ limit: 12, offset: 0 });
    const rawList = data?.data || data?.mvs || [];
    mvList.value = rawList.map((item: any) => ({
      id: item.id || item.mvid || item.mvId || item.vid,
      name: item.name || item.title,
      cover: item.cover || item.imgurl16v9 || item.coverImgUrl || item.picUrl || item.picUrl16v9 || item.imgurl || '',
      playCount: item.playCount || item.playTime || 0,
      artistName: item.artistName || item.artist?.name || (item as any).creator?.nickname || '',
    })).filter((item: any) => item.id);
    if (mvList.value.length) {
      apiCache.set(cacheKey, mvList.value, 600000);
    }
    if (!mvList.value.length) {
      mvError.value = '暂未获取到 MV 数据';
    }
  } catch (e: any) {
    mvList.value = [];
    mvError.value = e?.message || 'MV 获取失败';
  } finally {
    mvLoading.value = false;
  }
}

async function fetchPodcastList() {
  const cacheKey = 'home:podcastList';
  const cached = apiCache.get(cacheKey);
  if (cached?.data) {
    podcastList.value = cached.data;
    podcastLoading.value = false;
    return;
  }
  podcastLoading.value = true;
  podcastError.value = '';
  try {
    const { data } = await getDjRecommend();
    const rawList = data?.djRadios || data?.data?.djRadios || [];
    podcastList.value = rawList.slice(0, 9).map((item: any) => ({
      id: item.id || item.radio?.id,
      name: item.name,
      picUrl: item.picUrl || item.coverUrl || item.imgUrl || item.blurCoverUrl || '',
      subCount: item.subCount || item.programCount || 0,
      creatorName: item.creator?.nickname || item.radio?.creator?.nickname || '',
    })).filter((item: any) => item.id);
    if (podcastList.value.length) {
      apiCache.set(cacheKey, podcastList.value, 600000);
    }
    if (!podcastList.value.length) {
      podcastError.value = '暂未获取到播客数据';
    }
  } catch (e: any) {
    podcastList.value = [];
    podcastError.value = e?.message || '播客获取失败';
  } finally {
    podcastLoading.value = false;
  }
}

onMounted(async () => {

  window.addEventListener('click', onFmPopoverDocClick);
  window.addEventListener('keydown', onFmPopoverKeydown);

  // 等待登录验证完成后再加载所有数据，确保所有卡片同时出现
  if (!userStore.state.loginVerified && userStore.state.loginCookie) {
    await new Promise<void>((resolve) => {
      const unwatch = watch(() => userStore.state.loginVerified, (val) => {
        if (val) { unwatch(); resolve(); }
      });
      // 安全超时：20 秒后强制继续
      setTimeout(() => { unwatch(); resolve(); }, 20000);
    });
  }

  await Promise.all([loadMoreHotSongs(), fetchDailyRecommendSongs(), fetchDailyRecommendPlaylists(), fetchPublicRecoPlaylists(), fetchPersonalFm(), fetchRadarPlaylistDetail(), fetchTopArtists(), fetchTopAlbums(), fetchLatestMusic(), fetchMvList(), fetchPodcastList(), fetchRadarPlaylists()]);

  await nextTick();
  setupHotSongsObserver();
});

onBeforeUnmount(() => {
  window.removeEventListener('click', onFmPopoverDocClick);
  window.removeEventListener('keydown', onFmPopoverKeydown);
  if (hotSongsObserver) {
    hotSongsObserver.disconnect();
    hotSongsObserver = null;
  }
  if (latestScrollRaf) {
    cancelAnimationFrame(latestScrollRaf);
    latestScrollRaf = 0;
  }
  if (topArtistsObserver) {
    topArtistsObserver.disconnect();
    topArtistsObserver = null;
  }
  if (topArtistsSentinel.value) {
    topArtistsSentinel.value = null;
  }
  if (latestWheelRaf) {
    cancelAnimationFrame(latestWheelRaf);
    latestWheelRaf = 0;
  }
});

watch(
  () => [userStore.state.isLogin, userStore.state.loginMode, userStore.state.profile?.userId],
  async () => {
    await Promise.all([fetchDailyRecommendSongs(), fetchDailyRecommendPlaylists(), fetchPublicRecoPlaylists(), fetchPersonalFm(), fetchRadarPlaylistDetail()]);
  },
);

watch(
  () => uiStore.state.themeMode,
  (mode) => {
    playerStore.syncThemeState(mode);
    playerStore.persist();
  },
  { immediate: true },
);

watch(
  () => [playerStore.state.playlist.length, playerStore.state.currentIndex, playerStore.state.personalFmTrackIds.length],
  () => {
    syncPersonalFmViewFromPlayer();
  },
);

function quickSearch(keyword: string) {
  const clean = keyword.trim();
  if (!clean) return;
  const next = [clean, ...searchHistory.value.filter((x) => x !== clean)].slice(0, 12);
  searchHistory.value = next;
  localStorage.setItem('tm_search_history', JSON.stringify(next));
  emit('open-search', clean);
}

function onThemeChange(e: Event) {
  const value = (e.target as HTMLSelectElement).value;
  if (value === '浅色' || value === '深色' || value === '跟随系统') {
    uiStore.setThemeMode(value);
  }
}

function getTrackArtists(track: any) {
  const artists = Array.isArray(track?.ar)
    ? track.ar
    : Array.isArray(track?.artists)
      ? track.artists
      : Array.isArray(track?.album?.artists)
        ? track.album.artists
        : [];
  return artists.filter((artist: any) => artist?.id || artist?.name);
}

function getAlbumArtists(item: any) {
  const artists = Array.isArray(item?.artists)
    ? item.artists
    : item?.artist
      ? [item.artist]
      : [];
  return artists.filter((artist: any) => artist?.id || artist?.name);
}

function resolvePlaylistCreatorId(item: any) {
  return Number(item?.creator?.userId || item?.creator?.id || item?.userId || item?.uid || 0);
}

function resolvePlaylistCreatorName(item: any) {
  return item?.creator?.nickname || item?.creator?.userName || item?.nickname || item?.userName || '创建者';
}

function openPlaylistCategory(category: string) {
  if (!category?.trim()) return;
  emit('open-playlist-category', category.trim());
}

function openArtistDetail(artist: any) {
  const artistId = Number(artist?.id || artist?.artistId || 0);
  if (!artistId) return;
  emit('open-artist', artist);
}

function openUserDetailById(userId: number) {
  const normalizedId = Number(userId || 0);
  if (!normalizedId) return;
  emit('open-user', normalizedId);
}

function openDailyRecommendDetail() {
  if (!dailyRecommendSongs.value.length) return;
  emit('open-daily-list', dailyRecommendSongs.value);
}

function openRecoDetail(playlistId: number) {
  if (!playlistId) return;
  const cover = topRecoCardCoverUrl.value || '';
  emit('open-detail', playlistId, cover, 'home');
}

function openAlbumDetail(albumId: number) {
  if (!albumId) return;
  emit('open-album-detail', albumId);
}

function openMv(mv: any) {
  if (!mv?.id) return;
  emit('open-mv-player', mv);
}

function openPodcast(item: any) {
  if (!item?.id) return;
  emit('open-podcast-detail', item);
}

async function playDailyRecommendByIndex(index: number) {
  if (!dailyRecommendSongs.value.length) return;
  playerStore.setPlaylist(dailyRecommendSongs.value, index);
  await playerStore.playByIndex(index);
}

async function playRadarTop() {
  if (!radarTopTracks.value.length) return;
  playerStore.setPlaylist(radarTopTracks.value, 0);
  await playerStore.playByIndex(0);
}

async function playRecoByIndex(index: number) {
  if (!topRecoTracks.value.length) return;
  playerStore.setPlaylist(topRecoTracks.value, index);
  await playerStore.playByIndex(index);
}

async function playPersonalFmByIndex(index: number) {
  if (!personalFmTracks.value.length) return;
  playerStore.setPersonalFmFetcher(requestPersonalFmBatch);
  playerStore.state.personalFmHasMore = true;
  playerStore.setPersonalFmPlaylist(personalFmTracks.value, index);
  await playerStore.playByIndex(index);
  syncPersonalFmViewFromPlayer();
}

async function togglePersonalFmPlayback() {
  if (!personalFmTracks.value.length) return;

  if (!isPersonalFmCurrentTrack.value) {
    await playPersonalFmByIndex(0);
    return;
  }

  await playerStore.togglePlay();
}

async function nextPersonalFm() {
  if (!personalFmTracks.value.length) return;

  if (!isPersonalFmCurrentTrack.value) {
    await playPersonalFmByIndex(0);
    return;
  }

  await playerStore.next();
  syncPersonalFmViewFromPlayer();
}

async function dislikePersonalFm() {
  if (!personalFmTracks.value.length) return;

  if (!isPersonalFmCurrentTrack.value) {
    await playPersonalFmByIndex(0);
  }

  const disliked = await playerStore.dislikeCurrentPersonalFm(userStore.state.loginCookie || undefined);
  syncPersonalFmViewFromPlayer();

  if (!disliked) {
    await nextPersonalFm();
    return;
  }

  if (!personalFmTracks.value.length) {
    await fetchPersonalFm();
  }
}

function onSongRowDblClick(event: MouseEvent, index: number) {
  const target = event.target as HTMLElement | null;
  if (target?.closest('button, a, input, select, textarea, [role="button"]')) return;
  void playSong(index);
}

async function playSong(index: number) {
  if (!songs.value.length) return;
  playerStore.setPlaylist(songs.value, index);
  await playerStore.playByIndex(index);
}

async function playLatestSong(index: number) {
  if (!latestSongs.value.length) return;
  playerStore.setPlaylist(latestSongs.value, index);
  await playerStore.playByIndex(index);
}
</script>

<style scoped>
@import '../styles/hover-play-button.css';
.home-page { display: grid; gap: var(--space-3); min-width: 0; overflow-x: clip; }
.top-artists-section { display: grid; gap: var(--space-2); padding: 0; min-height: 154px; }
.rail-placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  min-height: 100px;
  color: var(--text-soft);
  font-size: var(--text-body-md);
}
:deep(.top-artists-row) { --horizontal-scroll-gap: var(--space-8); --horizontal-scroll-padding-bottom: 0; display: flex; align-items: flex-start; padding-top: var(--space-1); scroll-snap-type: none !important; }
:deep(.top-artists-row) > * { flex: 0 0 auto; }
.artist-chip {
  flex: 0 0 auto;
  min-width: 120px;
  display: grid;
  justify-items: center;
  gap: var(--space-4);
  border: none !important;
  background: transparent !important;
  padding: 0;
  margin: 0;
  cursor: pointer;
  color: inherit;
  font: inherit;
  line-height: inherit;
  appearance: none;
  -webkit-appearance: none;
  outline: none !important;
  box-shadow: none !important;
  -webkit-tap-highlight-color: transparent;
}
.artist-chip::-moz-focus-inner { border: 0; padding: 0; }
.artist-chip::before,
.artist-chip::after {
  content: none !important;
  display: none !important;
}
.artist-chip:hover,
.artist-chip:active,
.artist-chip:focus,
.artist-chip:focus-visible {
  background: transparent !important;
  outline: none !important;
  box-shadow: none !important;
  border: none !important;
}
.artist-avatar { width: 110px; height: 110px; border-radius: 999px; background: center/cover no-repeat; background-clip: padding-box; border: 2px solid transparent; box-shadow: 0 10px 24px rgba(15, 23, 42, 0.12); transition: border-color var(--an-duration-fast, 320ms) ease; }
.artist-name { color: var(--text-main); font-size: var(--text-label-md); font-weight: 600; max-width: 120px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.artist-chip:hover .artist-avatar {
  border-color: var(--accent);
}
.artist-inline-btn + .artist-inline-btn.latest-splitter::before { color: var(--text-soft); }
.creator-inline-btn {
  margin-top: 10px;
  color: rgba(255, 255, 255, 0.92);
  font-size: 13px;
  font-weight: 600;
  text-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
}
.home-top-reco { display: flex; gap: var(--space-3); }
.top-mini-card { flex: 1; min-width: 0; padding: var(--space-3); display: grid; gap: var(--space-2); }
.mini-head { display: flex; align-items: center; justify-content: space-between; gap: var(--space-2); }
.mini-head h3 { margin: 0; color: var(--text-main); font-size: var(--text-body-md); }
.mini-tip { font-size: var(--text-label-sm); color: var(--text-soft); }
.mini-desc { margin: 0; color: var(--text-sub); font-size: 13px; line-height: 1.5; }
.mini-desc.error { color: color-mix(in srgb, #ef4444 76%, var(--text-main)); }
.daily-card { padding: 0; border-radius: 12px; overflow: hidden; }
.daily-hero.poster { position: relative; width: 100%; height: 344px; border: none; padding: 0; margin: 0; background: var(--bg-soft); cursor: pointer; overflow: hidden; display: block; }
.daily-bg { position: absolute; inset: 0; background: center/cover no-repeat; filter: saturate(0.88) contrast(0.9); }
.daily-hero.poster::before { content: ''; position: absolute; inset: 0; background: linear-gradient(180deg, rgba(17, 24, 39, 0.08) 0%, rgba(75, 85, 99, 0.22) 38%, rgba(107, 114, 128, 0.58) 72%, rgba(107, 114, 128, 0.86) 100%); }
.daily-poster-top { position: absolute; left: 16px; top: 14px; display: flex; align-items: center; gap: var(--space-2); z-index: 2; }
.daily-calendar { width: 26px; height: 26px; border-radius: 8px; background: rgba(255,255,255,0.86); color: var(--text-soft); font-size: var(--text-label-sm); font-weight: 700; display: grid; place-items: center; }
.daily-top-title { color: #fff; font-size: var(--text-display); font-weight: 800; letter-spacing: 1px; text-shadow: 0 2px 8px rgba(0,0,0,0.2); }
.daily-bottom-zone { position: absolute; left: 0; right: 0; bottom: 0; z-index: 4; display: grid; gap: 0; background: linear-gradient(180deg, rgba(107, 114, 128, 0.04) 0%, rgba(107, 114, 128, 0.22) 26%, rgba(107, 114, 128, 0.56) 58%, rgba(107, 114, 128, 0.84) 100%); }
.daily-poster-bottom { display: block; padding: var(--space-4) var(--space-4) var(--space-5); color: #fff; font-size: var(--text-body-lg); font-weight: 700; line-height: 1.35; text-align: left; transform: translateY(0); transition: transform 320ms ease, opacity 320ms ease; }
.daily-hover-list { display: grid; gap: 6px; padding: 0 var(--space-3) var(--space-3); opacity: 0; max-height: 0; overflow: hidden; transform: translateY(12px); transition: max-height 320ms ease, transform 320ms ease, opacity 320ms ease; pointer-events: none; }
.daily-hover-item { display: grid; grid-template-columns: 18px minmax(0, 1fr) auto; align-items: center; gap: 8px; color: #fff; border: none; background: transparent; padding: 0; text-align: left; cursor: pointer; }
.daily-hover-item:hover .daily-hover-name { text-decoration: underline; }
.daily-hover-rank { font-size: var(--text-label-sm); font-weight: 700; text-align: center; color: rgba(255, 255, 255, 0.95); }
.daily-hover-name { display: block; justify-self: start; width: 100%; text-align: left; font-size: 13px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.daily-hover-artist { justify-self: end; text-align: right; font-size: var(--text-label-sm); color: rgba(255, 255, 255, 0.82); max-width: 96px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.daily-hero.poster:hover .daily-poster-bottom,
.daily-hero.poster:focus-visible .daily-poster-bottom,
.daily-bottom-zone:hover .daily-poster-bottom,
.daily-bottom-zone:focus-within .daily-poster-bottom { transform: translateY(-8px); }
.daily-hero.poster:hover .daily-hover-list,
.daily-hero.poster:focus-visible .daily-hover-list,
.daily-bottom-zone:hover .daily-hover-list,
.daily-bottom-zone:focus-within .daily-hover-list { opacity: 1; max-height: 140px; transform: translateY(0); }

.radar-card { padding: 0; border-radius: 12px; overflow: hidden; min-height: 344px; }
.radar-hero.poster { position: relative; width: 100%; height: 344px; border: none; padding: 0; margin: 0; background: #9ca3af; cursor: pointer; overflow: hidden; display: block; }
.radar-bg { position: absolute; inset: 0; background: center/cover no-repeat; filter: saturate(0.88) contrast(0.9); }
.radar-hero.poster::before { content: ''; position: absolute; inset: 0; background: linear-gradient(180deg, rgba(17, 24, 39, 0.08) 0%, rgba(75, 85, 99, 0.22) 38%, rgba(107, 114, 128, 0.58) 72%, rgba(107, 114, 128, 0.86) 100%); }
.radar-poster-top { position: absolute; left: 16px; top: 14px; display: flex; align-items: center; gap: var(--space-2); z-index: 2; }
.radar-calendar { width: 26px; height: 26px; border-radius: 8px; background: rgba(255,255,255,0.86); color: var(--text-soft); font-size: var(--text-label-sm); font-weight: 700; display: grid; place-items: center; }
.radar-top-title { color: #fff; font-size: var(--text-display); font-weight: 800; letter-spacing: 1px; text-shadow: 0 2px 8px rgba(0,0,0,0.2); }
.radar-bottom-zone { position: absolute; left: 0; right: 0; bottom: 0; z-index: 4; display: grid; gap: 0; background: linear-gradient(180deg, rgba(107, 114, 128, 0.04) 0%, rgba(107, 114, 128, 0.22) 26%, rgba(107, 114, 128, 0.56) 58%, rgba(107, 114, 128, 0.84) 100%); }
.radar-poster-bottom { display: block; padding: 16px 18px 20px; color: #fff; font-size: var(--text-body-lg); font-weight: 700; line-height: 1.35; text-align: left; transform: translateY(0); transition: transform 320ms ease, opacity 320ms ease; }
.radar-hover-list { display: grid; gap: 6px; padding: 0 14px 14px; opacity: 0; max-height: 0; overflow: hidden; transform: translateY(12px); transition: max-height 320ms ease, transform 320ms ease, opacity 320ms ease; pointer-events: none; }
.radar-hover-item { display: grid; grid-template-columns: 18px minmax(0, 1fr) auto; align-items: center; gap: 8px; color: #fff; }
.radar-hover-rank { font-size: var(--text-label-sm); font-weight: 700; text-align: center; color: rgba(255, 255, 255, 0.95); }
.radar-hover-name { display: block; justify-self: start; width: 100%; text-align: left; font-size: 13px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.radar-hover-artist { justify-self: end; text-align: right; font-size: var(--text-label-sm); color: rgba(255, 255, 255, 0.82); max-width: 96px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.radar-hero.poster:hover .radar-poster-bottom,
.radar-hero.poster:focus-visible .radar-poster-bottom,
.radar-bottom-zone:hover .radar-poster-bottom,
.radar-bottom-zone:focus-within .radar-poster-bottom { transform: translateY(-8px); }
.radar-hero.poster:hover .radar-hover-list,
.radar-hero.poster:focus-visible .radar-hover-list,
.radar-bottom-zone:hover .radar-hover-list,
.radar-bottom-zone:focus-within .radar-hover-list { opacity: 1; max-height: 140px; transform: translateY(0); }

.fm-card { padding: 0; border-radius: 12px; overflow: hidden; min-height: 344px; }
.fm-hero.poster { position: relative; width: 100%; height: 344px; border: none; padding: 0; margin: 0; background: #9ca3af; cursor: pointer; overflow: hidden; display: block; }
.fm-bg { position: absolute; inset: 0; background: center/cover no-repeat; filter: saturate(0.88) contrast(0.9); }
.fm-hero.poster::before { content: ''; position: absolute; inset: 0; background: linear-gradient(180deg, rgba(17, 24, 39, 0.08) 0%, rgba(75, 85, 99, 0.22) 38%, rgba(107, 114, 128, 0.58) 72%, rgba(107, 114, 128, 0.86) 100%); }
.fm-poster-top { position: absolute; left: 16px; top: 14px; display: flex; align-items: center; gap: 10px; z-index: 2; }
.fm-top-title { color: #fff; font-size: var(--text-display); font-weight: 800; letter-spacing: 1px; text-shadow: 0 2px 8px rgba(0,0,0,0.2); }
.fm-bottom-zone { position: absolute; left: 0; right: 0; bottom: 0; z-index: 4; display: grid; gap: 12px; background: linear-gradient(180deg, rgba(107, 114, 128, 0.04) 0%, rgba(107, 114, 128, 0.22) 26%, rgba(107, 114, 128, 0.56) 58%, rgba(107, 114, 128, 0.84) 100%); }
.fm-poster-bottom { display: block; padding: 16px 18px 0; color: #fff; font-size: var(--text-body-lg); font-weight: 700; line-height: 1.35; text-align: left; transform: translateY(0); transition: transform 320ms ease, opacity 320ms ease; }
.fm-control-panel { display: flex; align-items: center; justify-content: center; gap: 20px; padding: 4px 18px 18px; opacity: 0; max-height: 0; overflow: visible; transform: translateY(12px); transition: max-height 320ms ease, transform 320ms ease, opacity 320ms ease; pointer-events: none; will-change: transform, opacity; }
.fm-control-btn {
  border: none;
  background: transparent;
  color: var(--theme-primary);
  padding: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: transform 180ms ease, filter 180ms ease;
  pointer-events: auto;
  will-change: transform, filter;
}
.fm-control-btn--ghost {
  width: 44px;
  height: 44px;
  border-radius: 999px;
  background: var(--glass-reflection), color-mix(in srgb, rgba(255, 255, 255, 0.18) 82%, transparent);
  backdrop-filter: blur(var(--glass-blur, 10px));
  -webkit-backdrop-filter: blur(var(--glass-blur, 10px));
  box-shadow: var(--glass-highlight), 0 10px 24px rgba(15, 23, 42, 0.16);
}
.fm-control-btn--primary {
  width: 44px;
  height: 44px;
  border-radius: 999px;
  background: var(--glass-reflection), color-mix(in srgb, var(--theme-primary) 26%, rgba(255, 255, 255, 0.3));
  backdrop-filter: blur(var(--glass-blur, 10px));
  -webkit-backdrop-filter: blur(var(--glass-blur, 10px));
  box-shadow: var(--glass-highlight), 0 14px 32px color-mix(in srgb, var(--theme-primary) 24%, rgba(15, 23, 42, 0.28));
}
:global(.dark) .fm-control-btn--ghost,
:global([data-theme='dark']) .fm-control-btn--ghost {
  background: var(--glass-reflection), color-mix(in srgb, rgba(15, 23, 42, 0.72) 86%, transparent);
}
:global(.dark) .fm-control-btn--primary,
:global([data-theme='dark']) .fm-control-btn--primary {
  background: var(--glass-reflection), color-mix(in srgb, var(--theme-primary) 34%, rgba(15, 23, 42, 0.44));
}
.fm-control-btn:hover,
.fm-control-btn:focus-visible {
  transform: scale(1.08);
  filter: saturate(1.08) brightness(0.94);
}
.fm-control-btn:focus-visible {
  outline: 2px solid color-mix(in srgb, #fff 64%, var(--theme-primary));
  outline-offset: 3px;
}
.fm-control-icon { display: inline-flex; width: 24px; height: 24px; }
.fm-control-btn--primary .fm-control-icon { width: 24px; height: 24px; }
.fm-control-icon :deep(svg) { width: 100%; height: 100%; }
.fm-hero.poster:hover .fm-poster-bottom,
.fm-hero.poster:focus-visible .fm-poster-bottom,
.fm-bottom-zone:hover .fm-poster-bottom,
.fm-bottom-zone:focus-within .fm-poster-bottom { transform: translateY(-8px); }
.fm-hero.poster:hover .fm-control-panel,
.fm-hero.poster:focus-visible .fm-control-panel,
.fm-bottom-zone:hover .fm-control-panel,
.fm-bottom-zone:focus-within .fm-control-panel { opacity: 1; max-height: 140px; transform: translateY(0); pointer-events: auto; }
.home-grid { width: 100%; min-width: 0; display: flex; flex-direction: column; gap: 12px; }
.card { padding-top: calc(var(--layout-card-padding) + 10px); }
.card.list { overflow-y: auto; overflow-x: hidden; }
.card.list::-webkit-scrollbar { width: 0; height: 0; }
.card.list { scrollbar-width: none; }
.card h3 { margin: 0 0 var(--space-3); color: var(--text-main); }
.tag-grid { display: flex; flex-wrap: wrap; gap: var(--space-2); }
.tag { color: var(--text-sub); border-radius: 999px; padding: var(--space-1) var(--space-3); cursor: pointer; transition: transform 0.16s ease, box-shadow 0.16s ease, border-color 0.16s ease, background 0.16s ease; }
.tag:hover { transform: translateY(-1px); }
.tag:active { transform: translateY(0) scale(0.99); }
.music-list { margin: 0; padding: 0; list-style: none; display: grid; gap: 4px; max-height: 580px; overflow-y: auto; scrollbar-width: none; }
.music-list::-webkit-scrollbar { width: 0; height: 0; }
.list-hint { margin: var(--space-2) 0 0; text-align: center; font-size: var(--text-label-sm); color: var(--text-soft); }
.list-sentinel { width: 100%; height: 1px; }
.song { display: grid; grid-template-columns: 56px 1fr auto; align-items: center; gap: 10px; padding: 8px 10px; border-radius: 12px; }
.song.playing { border: 1px solid color-mix(in srgb, var(--accent) 44%, var(--border)); background: color-mix(in srgb, var(--accent) 15%, var(--bg-surface)); }
.cover { width: 56px; height: 56px; border-radius: 12px; background: var(--bg-soft) center/cover no-repeat; }
.name { color: var(--text-main); font-weight: 600; }
.artist { color: var(--text-soft); font-size: var(--text-label-sm); }
.ops { display: flex; gap: 8px; }
.icon-btn-wrap { display: inline-flex; align-items: center; }
:deep(.latest-scroll) {
  --horizontal-scroll-gap: 0;
  --horizontal-scroll-padding-bottom: 0;
}
:deep(.albums-row) {
  align-items: flex-start;
}
:deep(.albums-row) > * {
  flex: 1 1 0;
  min-width: 160px;
}
.albums-column {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}
.exclusive-recommend-grid {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-3);
}
.exclusive-recommend-grid > * {
  width: calc((100% - 5 * var(--space-3)) / 6);
  min-width: 0;
}
.radar-playlist-desc {
  display: block;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 100%;
}
.latest-track {
  display: flex;
  gap: var(--space-4);
  width: max-content;
  min-width: 100%;
  will-change: transform;
  contain: layout paint;
}
.latest-band {
  display: flex;
  gap: var(--space-3);
  flex: 1 1 0;
  min-width: 0;
  contain: content;
}
.latest-column {
  display: grid;
  gap: var(--space-2);
  flex: 1 1 0;
  min-width: 240px;
  max-width: 360px;
  contain: content;
}
.latest-row {
  display: grid;
  grid-template-columns: 44px minmax(0, 1fr);
  align-items: center;
  gap: 10px;
  width: 100%;
  border: none;
  background: transparent;
  border-radius: 10px;
  padding: var(--space-1) var(--space-2);
  text-align: left;
  cursor: pointer;
  transition: background-color 180ms ease, transform 180ms ease;
}
.latest-row:hover,
.latest-row:focus-visible {
  background: color-mix(in srgb, var(--accent) 10%, transparent);
  transform: translateX(2px);
}
.latest-cover {
  width: 44px;
  height: 44px;
  border-radius: 8px;
  background: var(--bg-soft) center/cover no-repeat;
  box-shadow: 0 6px 14px rgba(15, 23, 42, 0.12);
  flex-shrink: 0;
}
.latest-meta { min-width: 0; }
.latest-name {
  color: var(--text-main);
  font-size: var(--text-label-md);
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.latest-artist {
  color: var(--text-soft);
  font-size: var(--text-label-sm);
  margin-top: 2px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.latest-artist .artist-inline-btn + .artist-inline-btn::before,
.artist .artist-inline-btn + .artist-inline-btn::before,
.album-artist .artist-inline-btn + .artist-inline-btn::before {
  color: var(--text-soft);
}
.custom-desc { color: var(--text-sub); margin: 0; }
.custom-tip { color: var(--text-soft); font-size: var(--text-label-sm); margin: var(--space-2) 0 0; }
.hot-list { margin: 0; padding: 0; list-style: none; display: grid; gap: 6px; }
.hot-item { display: grid; grid-template-columns: 24px 1fr; gap: 8px; padding: 6px 8px; border-radius: 8px; cursor: pointer; }
.hot-item:hover { background: var(--bg-muted); }
.rank { font-weight: 700; color: var(--accent); text-align: center; }
.kw { color: var(--text-main); }
.history-tags { display: flex; flex-wrap: wrap; gap: 8px; }
.podcast-grid { display: grid; grid-template-columns: repeat(5, 1fr); gap: var(--space-4); }
.podcast-grid > * { min-width: 0; }
.mv-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: var(--space-4); }
.card.podcast, .card.mv { overflow: visible; }
.mv-card { cursor: pointer; display: flex; flex-direction: column; gap: var(--space-2); min-width: 0; }
.mv-card__info { display: flex; flex-direction: column; gap: var(--space-1); }
.mv-card__name { color: var(--text-main); font-size: var(--text-label-md); font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.mv-card__artist { color: var(--text-soft); font-size: var(--text-label-sm); }
.theme-select { margin-top: 8px; height: 34px; border: 1px solid var(--border); border-radius: 10px; background: var(--bg-muted); color: var(--text-main); padding: 0 10px; }
@media (max-width: 980px) {
  .home-top-reco { flex-direction: column; }
  :deep(.top-artists-row) { --horizontal-scroll-gap: 24px; }
  .artist-avatar { width: 94px; height: 94px; }
  .latest-column { width: 280px; flex-basis: 280px; }
}

@media (max-width: 767px) {
  .home-grid { grid-template-columns: repeat(8, minmax(0, 1fr)); }
  :deep(.top-artists-row) { --horizontal-scroll-gap: 20px; }
  .artist-avatar { width: 87px; height: 87px; }
  .card { grid-column: 1 / -1 !important; grid-row: auto !important; }
  .latest-column { width: 260px; flex-basis: 260px; }
}

/* ---- FM 模式选择浮窗 ---- */
.fm-mode-btn {
  width: 28px;
  height: 28px;
  border: none;
  background: rgba(255, 255, 255, 0.18);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  border-radius: 999px;
  color: rgba(255, 255, 255, 0.92);
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
  transition: opacity 220ms ease, transform 180ms ease, background 180ms ease, box-shadow 180ms ease;
  padding: 0;
  opacity: 0;
  pointer-events: none;
}
.fm-mode-btn.hover-visible {
  opacity: 1;
  pointer-events: auto;
}
.fm-mode-btn svg {
  width: 14px;
  height: 14px;
}
.fm-mode-btn:hover,
.fm-mode-btn.active {
  background: rgba(255, 255, 255, 0.32);
  transform: scale(1.08);
}
.fm-mode-btn:active {
  transform: scale(0.94);
}
:global(.dark) .fm-mode-btn {
  background: rgba(15, 23, 42, 0.5);
}
:global(.dark) .fm-mode-btn:hover,
:global(.dark) .fm-mode-btn.active {
  background: rgba(15, 23, 42, 0.7);
}

.fm-mode-popover {
  position: fixed;
  z-index: 10000;
  width: 240px;
  max-width: calc(100vw - 16px);
  background: var(--bg-solid);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  box-shadow: 0 16px 48px color-mix(in srgb, rgba(15, 23, 42, 0.18), transparent), 0 4px 16px color-mix(in srgb, rgba(15, 23, 42, 0.1), transparent);
  overflow: hidden;
  display: grid;
  gap: 0;
}
.fm-mode-popover-header {
  padding: var(--space-3) var(--space-3) var(--space-2);
  font-size: 13px;
  font-weight: 700;
  color: var(--text-main);
  border-bottom: 1px solid var(--border-soft);
}
.fm-mode-options {
  display: grid;
  gap: 2px;
  padding: var(--space-2);
}
.fm-mode-option {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  width: 100%;
  padding: var(--space-2) var(--space-2);
  border: none;
  border-radius: 8px;
  background: transparent;
  color: var(--text-main);
  text-align: left;
  cursor: pointer;
  transition: background 120ms ease;
}
.fm-mode-option:hover {
  background: var(--bg-muted);
}
.fm-mode-option.selected {
  background: color-mix(in srgb, var(--accent) 10%, var(--bg-muted));
}
.fm-mode-option-radio {
  width: 16px;
  height: 16px;
  border-radius: 999px;
  border: 2px solid var(--border);
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: border-color 180ms ease;
}
.fm-mode-option.selected .fm-mode-option-radio {
  border-color: var(--accent);
}
.fm-mode-option-dot {
  width: 8px;
  height: 8px;
  border-radius: 999px;
  background: var(--accent);
}
.fm-mode-option-text {
  display: grid;
  gap: 1px;
  min-width: 0;
}
.fm-mode-option-label {
  font-size: 13px;
  font-weight: 600;
  line-height: 1.3;
}
.fm-mode-option-desc {
  font-size: var(--text-label-xs);
  color: var(--text-soft);
  line-height: 1.3;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.fm-submode-section {
  border-top: 1px solid var(--border-soft);
  padding: var(--space-2);
}
.fm-submode-label {
  font-size: var(--text-label-xs);
  font-weight: 600;
  color: var(--text-soft);
  padding: 0 var(--space-2) var(--space-1);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
.fm-submode-options {
  display: grid;
  gap: 2px;
}
.fm-submode-option {
  padding-left: calc(var(--space-2) + 18px + var(--space-2));
}
.fm-mode-popover-footer {
  padding: var(--space-2) var(--space-3) var(--space-3);
  border-top: 1px solid var(--border-soft);
}
.fm-mode-apply-btn {
  width: 100%;
  height: var(--button-height-md);
  border: none;
  border-radius: var(--button-radius-md);
  background: var(--accent);
  color: #fff;
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
  transition: filter 180ms ease, transform 180ms ease;
}
.fm-mode-apply-btn:hover {
  filter: brightness(1.06);
  transform: scale(1.02);
}
.fm-mode-apply-btn:active {
  filter: brightness(0.94);
  transform: scale(0.98);
}

@media (max-width: 520px) {
  .fm-mode-popover {
    width: calc(100vw - 32px);
    max-width: calc(100vw - 32px);
  }
}

/* ---- 骨架屏占位样式 ---- */
.skeleton-text {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  color: rgba(255, 255, 255, 0.7);
  font-size: var(--text-body-md);
  font-weight: 500;
  text-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
  z-index: 5;
  pointer-events: none;
}
.skeleton-text.error {
  color: rgba(248, 113, 113, 0.82);
}
.is-skeleton {
  cursor: default !important;
}

/* 网格卡片区加载占位 min-height */
.card.albums,
.card.exclusive-recommend,
.card.radar-playlist {
  min-height: 280px;
}
.card.podcast {
  min-height: 310px;
}
.card.mv {
  min-height: 340px;
}
.card.latest-music {
  min-height: 220px;
}
.card.list {
  min-height: 580px;
}
</style>
