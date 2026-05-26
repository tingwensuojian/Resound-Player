<template>
  <transition :name="playerTransitionName">
    <div
      v-if="playerStore.state.expanded"
      class="expanded-wrap"
      :class="{ 'mode-fullscreen': lyricsSettings.state.displayMode === 'fullscreen' }"
      :style="bgStyle"
      @click.self="playerStore.closeExpanded()"
    >
      <!-- 全屏封面（独立层）：有自定义背景时隐藏，让自定义背景覆盖 -->
      <div v-if="lyricsSettings.state.showCover && lyricsSettings.state.displayMode === 'fullscreen' && !isCustomBg" class="fullscreen-cover fade-in-bg" :class="{ 'bg-loaded': coverLoaded }" :style="coverStyle"></div>
      <Transition name="cover-switch" mode="out-in" appear>
        <div :key="trackId" class="cover-aura" :style="coverAuraStyle"></div>
      </Transition>
      <!-- 背景过渡层：切歌时旧背景渐变淡出 -->
      <div v-if="prevBg" class="bg-transition-layer" :style="{ background: prevBg, opacity: bgFadeOpacity }"></div>
      <div v-show="showIridescence" ref="iriContainerRef" class="iri-container"></div>
      <div v-show="showIridescence" class="iri-blur" :style="iriBlurStyle"></div>
      <div v-show="showSoftGradient" class="soft-gradient-bg" :style="{ animationDuration: softGradientDuration + 's' }"></div>
      <div v-show="showThreeScene" ref="threeSceneRef" class="three-scene-container"></div>
      <div v-show="showPaper" ref="paperRef" class="paper-container"></div>
      <div v-show="showMist" ref="mistRef" class="mist-container"></div>
      <div v-show="showLoom" ref="loomRef" class="loom-container"></div>
      <div v-show="showSilk" ref="silkRef" class="silk-container"></div>
      <div v-show="showAurora" ref="auroraRef" class="aurora-container"></div>
      <div v-if="showAmllFluid" class="amll-fluid-container">
        <BackgroundRender
          :album="playerStore.state.currentTrack?.al?.picUrl || ''"
          :playing="!playerStore.state.isPlaying"
          :flowSpeed="amllFluidSpeed"
          :fps="30"
          :has-lyric="true"
        />
      </div>
      <section
        class="expanded-panel"
        :style="{ cursor: uiRevealed ? 'auto' : 'none' }"
        @mousemove="onActivity"
        @click="onActivity"
        @mouseleave="onLeave"
      >
          <AnimatedAppear
            tag="header"
            variant="content"
            rhythm="head"
            class-name="panel-head"
            :class="{ 'ui-hidden': !uiRevealed }"
            @mouseenter="freeze"
            @mouseleave="unfreeze"
          >
            <div class="panel-head-right">
              <AnimatedAppear tag="button" variant="control" rhythm="actions" :index="1" class-name="ghost ra-icon" @click="toggleFullscreen" :data-tooltip="isFullscreen ? '退出全屏' : '全屏'" data-tooltip-dir="down" :title="isFullscreen ? '退出全屏' : '全屏'">
                <svg v-if="isFullscreen" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3v3a2 2 0 0 1-2 2H3"/><path d="M21 8h-3a2 2 0 0 1-2-2V3"/><path d="M3 16h3a2 2 0 0 1 2 2v3"/><path d="M16 21v-3a2 2 0 0 1 2-2h3"/></svg>
                <svg v-else width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 8V5a2 2 0 0 1 2-2h3"/><path d="M16 3h3a2 2 0 0 1 2 2v3"/><path d="M21 16v3a2 2 0 0 1-2 2h-3"/><path d="M8 21H5a2 2 0 0 1-2-2v-3"/></svg>
              </AnimatedAppear>
              <AnimatedAppear tag="button" variant="control" rhythm="actions" :index="2" class-name="ghost ra-icon" @click="playerStore.closeExpanded()" data-tooltip="收起播放页" data-tooltip-dir="down" title="收起播放页">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>
              </AnimatedAppear>
            </div>
          </AnimatedAppear>

        <div class="panel-body" :class="{ 'comments-mode': showComments }" :style="panelBodyStyle">
          <div v-if="!lyricsSettings.state.showCover || lyricsSettings.state.displayMode === 'fullscreen'" class="cover-hidden-head">
                <AnimatedAppear tag="h2" variant="title" rhythm="title" class-name="song-name-center">{{ playerStore.state.currentTrack?.name || '未在播放' }}</AnimatedAppear>
                <AnimatedAppear tag="p" variant="text" rhythm="body" class-name="song-artist-center">
                  <template v-if="isCurrentPodcast">
                    <button type="button" class="artist-inline-btn" @click.stop="openPodcastDetail">{{ currentAlbumName }}</button>
                  </template>
                  <template v-else-if="playerStore.state.currentTrack?.ar?.length">
                    <button v-for="artist in playerStore.state.currentTrack.ar" :key="artist.id || artist.name" type="button" class="artist-inline-btn" :disabled="!(artist.id || artist.artistId)" @click.stop="openArtist(artist)">{{ artist.name }}</button>
                  </template>
                  <template v-else>{{ artistText }}</template>
                  <span v-if="playerStore.state.playbackRate !== 1" class="rate-badge">{{ playerStore.state.playbackRate.toFixed(2).replace(/\.00$/, '.0') }}x</span>
                </AnimatedAppear>
              </div>
              <div v-if="showLeftZone" class="left-zone" :class="{ 'mode-cover': lyricsSettings.state.displayMode === 'cover', 'mode-record': lyricsSettings.state.displayMode === 'record', 'l-only-cover': !lyricsSettings.state.showLyrics }">
                <!-- 封面模式 -->
                <template v-if="lyricsSettings.state.showCover && lyricsSettings.state.displayMode === 'cover'">
                  <Transition name="cover-switch" mode="out-in" appear>
                    <div :key="trackId" class="album-shell" :class="{ playing: playerStore.state.isPlaying }">
                      <div class="album-cover fade-in-bg" :class="{ 'bg-loaded': coverLoaded }" :style="coverStyle"></div>
                      <svg class="album-cover-logo" xmlns="http://www.w3.org/2000/svg" viewBox="30 30 140 140" width="100%" height="100%">
                        <defs>
                          <linearGradient id="logoGradExp" x1="0%" y1="0%" x2="100%" y2="100%">
                            <stop offset="0%" style="stop-color:#22c55e;stop-opacity:1" />
                            <stop offset="100%" style="stop-color:#16a34a;stop-opacity:1" />
                          </linearGradient>
                        </defs>
                        <path d="M55,100 A45,45 0 0,1 145,100" fill="none" stroke="url(#logoGradExp)" stroke-width="16" stroke-linecap="round" />
                        <rect x="40" y="100" width="30" height="45" rx="12" fill="url(#logoGradExp)" />
                        <rect x="130" y="100" width="30" height="45" rx="12" fill="url(#logoGradExp)" />
                        <circle cx="145" cy="122.5" r="5" fill="currentColor" opacity="0.3" />
                      </svg>
                    </div>
                  </Transition>
                </template>
                <!-- 唱片模式 -->
                <template v-if="lyricsSettings.state.showCover && lyricsSettings.state.displayMode === 'record'">
                  <Transition name="cover-switch" mode="out-in" appear>
                    <div :key="trackId" class="vinyl-record">
                      <div class="vinyl-pointer" :class="{ active: playerStore.state.isPlaying }">
                        <img class="needle" src="/images/needle.png" alt="pointer" />
                      </div>
                      <div class="vinyl-disc" :class="{ playing: playerStore.state.isPlaying }">
                        <div class="record-cover fade-in-bg" :class="{ 'bg-loaded': coverLoaded }" :style="coverStyle" />
                      </div>
                    </div>
                  </Transition>
                </template>
                <template v-if="lyricsSettings.state.showCover && lyricsSettings.state.displayMode !== 'fullscreen'">
                  <AnimatedAppear tag="h2" variant="title" rhythm="title" class-name="song-name" :key="'sn-'+trackId">{{ playerStore.state.currentTrack?.name || '未在播放' }}</AnimatedAppear>
                  <AnimatedAppear tag="p" variant="text" rhythm="body" class-name="song-artist" :key="'sa-'+trackId">
                    <template v-if="isCurrentPodcast">
                      <button type="button" class="artist-inline-btn" @click.stop="openPodcastDetail">{{ currentAlbumName }}</button>
                    </template>
                    <template v-else-if="playerStore.state.currentTrack?.ar?.length">
                      <button v-for="artist in playerStore.state.currentTrack.ar" :key="artist.id || artist.name" type="button" class="artist-inline-btn" :disabled="!(artist.id || artist.artistId)" @click.stop="openArtist(artist)">{{ artist.name }}</button>
                    </template>
                    <template v-else>{{ artistText }}</template>
                    <span v-if="playerStore.state.playbackRate !== 1" class="rate-badge">{{ playerStore.state.playbackRate.toFixed(2).replace(/\.00$/, '.0') }}x</span>
                  </AnimatedAppear>
                </template>
                <div v-show="showLeftControls" class="progress-wrap">
                  <input class="progress" type="range" min="0" :max="Math.max(1, Math.floor(playerStore.state.duration || 0))" :value="Math.floor(playerStore.state.currentTime || 0)" @mousedown="onSeekStart" @touchstart.passive="onSeekStart" @input="onSeek" @change="onSeekEnd" @mouseup="onSeekEnd" @touchend="onSeekEnd" />
                  <div v-if="isSeeking" class="seek-preview">{{ formatTime(seekPreviewTime) }}</div>
                  <div class="times"><span class="time">{{ formatTime(playerStore.state.currentTime) }}</span><span class="time">{{ formatTime(playerStore.state.duration) }}</span></div>
                </div>
                <div v-show="showLeftControls" class="controls">
                  <button class="ctrl" @click="playerStore.cyclePlayMode()" aria-label="切换播放模式"><Repeat v-if="playerStore.state.playMode === 'loop'" :size="16" /><Repeat1 v-else-if="playerStore.state.playMode === 'single'" :size="16" /><Shuffle v-else :size="16" /></button>
                  <template v-if="isPersonalFmCurrentTrack">
                    <button class="ctrl ctrl-dislike" @click="dislikeFmTrack" aria-label="不喜欢并切换下一首"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M10.8 5.5H6.9c-.93 0-1.74.64-1.95 1.54l-1.14 4.9a2 2 0 0 0 1.95 2.46h3.38l-.53 3.92a1.85 1.85 0 0 0 3.4 1.18l4.3-6.14c.2-.28.3-.62.3-.97V7.4a1.9 1.9 0 0 0-1.9-1.9h-3.9Zm7.15 0h1.65A1.4 1.4 0 0 1 21 6.9v6.95a1.4 1.4 0 0 1-1.4 1.4h-1.65V5.5Z"/></svg></button>
                    <button class="ctrl main" @click="playerStore.togglePlay()" aria-label="播放或暂停">{{ playerStore.state.isPlaying ? '❚❚' : '▶' }}</button>
                    <button class="ctrl" @click="playerStore.next()" aria-label="下一首"><SkipForward :size="16" /></button>
                    <button class="ctrl ctrl-fm-indicator" type="button" aria-label="当前为私人 FM" disabled>FM</button>
                  </template>
                  <template v-else>
                    <button class="ctrl" @click="playerStore.prev()" aria-label="上一首"><SkipBack :size="16" /></button>
                    <button class="ctrl main" @click="playerStore.togglePlay()" aria-label="播放或暂停">{{ playerStore.state.isPlaying ? '❚❚' : '▶' }}</button>
                    <button class="ctrl" @click="playerStore.next()" aria-label="下一首"><SkipForward :size="16" /></button>
                    <button class="ctrl" @click="uiStore.togglePlayQueue()" aria-label="查看播放列表"><AlignJustify :size="16" /></button>
                  </template>
                </div>
                <div v-show="showLeftControls" class="volume-wrap">
                  <div class="volume-control">
                    <button class="volume-icon-btn" type="button" :aria-label="playerStore.state.muted ? '取消静音' : '静音'" @click="playerStore.toggleMute()"><VolumeX v-if="playerStore.state.muted || playerStore.state.volume === 0" :size="18" /><Volume v-else-if="playerStore.state.volume < 0.33" :size="18" /><Volume1 v-else-if="playerStore.state.volume < 0.66" :size="18" /><Volume2 v-else :size="18" /></button>
                    <input type="range" min="0" max="100" :value="Math.round((playerStore.state.muted ? 0 : playerStore.state.volume) * 100)" @input="onVolume" />
                  </div>
                  <button v-if="playerStore.state.isIntelligenceActive &amp;&amp; uiStore.state.showIntelligenceIndicator" class="ctrl intel-icon" type="button" aria-label="心动模式"><Sparkles :size="14" /></button>
                  <button class="ctrl favorite-ctrl" type="button" :class="{ saved: isCurrentLiked, loading: likeLoading }" :aria-pressed="isCurrentLiked" :aria-label="isCurrentLiked ? '取消收藏' : '收藏'" :disabled="likeLoading || !canToggleCurrentLike" @click="toggleCurrentLike"><Heart :size="16" /></button>
                  <button class="ctrl volume-ctrl-comment" :class="{ active: showComments }" :disabled="!canComment" @click="showComments = !showComments" aria-label="评论区">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                  </button>
                </div>
              </div>
              <LyricsPanel :vinyl-mode="lyricsSettings.state.displayMode === 'record'" :fullscreen="lyricsSettings.state.displayMode === 'fullscreen'" :accent-color="palette.c3" />

          <div v-if="showComments" class="comments-overlay">
              <div class="comments-head">
                <div class="comments-head-cover">
                  <img v-if="currentCover" :src="currentCover + '?param=80y80'" :alt="playerStore.state.currentTrack?.name" />
                </div>
                <div class="comments-head-info">
                  <h3 class="comments-head-title">{{ playerStore.state.currentTrack?.name || '评论' }}</h3>
                  <p v-if="isCurrentPodcast" class="comments-head-artist">播客：<button type="button" class="head-link" @click.stop="openPodcastDetail">{{ currentAlbumName }}</button></p>
                  <p v-if="isCurrentPodcast && podcastPublishTime" class="comments-head-time">发布时间：{{ podcastPublishTime }}</p>
                  <template v-else>
                    <p v-if="currentArtistList.length" class="comments-head-artist">
                      歌手：<button v-for="(ar, i) in currentArtistList" :key="ar.id || ar.name" type="button" class="head-link" @click.stop="openArtist(ar)">{{ i > 0 ? ' / ' : '' }}{{ ar.name }}</button>
                    </p>
                    <p v-if="currentAlbumName" class="comments-head-album">专辑：<button type="button" class="head-link" @click.stop="openAlbum(currentAlbumId)">{{ currentAlbumName }}</button></p>
                  </template>
                </div>
              </div>
            <CommentPanel
              :resource-id="commentResourceId"
              :resource-type="commentResourceType"
              :fetcher="commentFetcher"
              :sender="api.sendComment"
              :liker="api.likeComment"
              :deleter="commentDeleter"
              @open-user="openUser"
            />
          </div>
        </div>

        <div
          class="right-actions"
          :class="{ 'ui-hidden': !uiRevealed }"
        >
          <button ref="gearBtnRef" class="ra-btn" title="歌词设置" @click="onOpenSettings"><Settings :size="22" /></button>
          <button class="ra-btn" title="歌词延迟0.5秒" @click="playerStore.adjustLyricsOffset(-0.5)"><Minus :size="22" /></button>
          <button class="ra-btn ra-btn--rect" title="点击打开精细调整" @click="showOffsetPanel = !showOffsetPanel">{{ formatOffset(playerStore.state.lyricsOffset) }}</button>
          <button class="ra-btn" title="歌词提前0.5秒" @click="playerStore.adjustLyricsOffset(0.5)"><Plus :size="22" /></button>
          <button class="ra-btn ra-btn-rect ra-btn-trans" :class="{ active: showTransPanel }" title="翻译/音译设置" @click="showTransPanel = !showTransPanel">译</button>
          <button class="ra-btn" title="多选歌词" @click="onOpenLyricsSelection"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2"/><rect x="9" y="3" width="6" height="4" rx="1"/><path d="M9 14l2 2 4-4"/></svg></button>
        </div>

        <Teleport to="body">
          <transition name="offset-fade">
            <div v-if="showOffsetPanel" class="offset-mask" @click="showOffsetPanel = false" @touchstart.passive="showOffsetPanel = false">
              <div class="offset-popover" :style="offsetPopoverStyle" @click.stop @touchstart.passive.stop>
                <div class="offset-head">歌词偏移</div>
                <div class="offset-body">
                  <button class="of-step" @click="playerStore.adjustLyricsOffset(-0.1)"><Minus :size="18" /></button>
                  <input v-if="editingOffset" ref="offsetInputRef" class="of-input" type="number" step="0.1" :value="playerStore.state.lyricsOffset" @blur="commitOffset" @keydown.enter="commitOffset" @keydown.escape="editingOffset = false" />
                  <span v-else class="of-value" @click="startEditOffset">{{ playerStore.state.lyricsOffset > 0 ? '+' : '' }}{{ playerStore.state.lyricsOffset.toFixed(1) }}s</span>
                  <button class="of-step" @click="playerStore.adjustLyricsOffset(0.1)"><Plus :size="18" /></button>
                </div>
                <div class="of-hint">点击数值可手动输入，步进 ±100ms</div>
                <div class="of-reset-wrap"><button class="of-reset" @click="playerStore.resetLyricsOffset()">重置为 0s</button></div>
              </div>
            </div>
          </transition>
        </Teleport>

        <!-- 翻译/音译设置弹窗 -->
        <Teleport to="body">
          <transition name="offset-fade">
            <div v-if="showTransPanel" class="offset-mask" @click="showTransPanel = false" @touchstart.passive="showTransPanel = false">
              <div class="trans-popover" :style="transPopoverStyle" @click.stop @touchstart.passive.stop>
                <div class="trans-head">歌词内容显示</div>
                <div class="trans-body">
                  <div class="trans-row">
                    <span class="trans-label">翻译</span>
                    <FancySwitch :model-value="lyricsSettings.state.showTranslation" @update:model-value="lyricsSettings.state.showTranslation = $event; lyricsSettings.save()" />
                  </div>
                  <div class="trans-row">
                    <span class="trans-label">音译</span>
                    <FancySwitch :model-value="lyricsSettings.state.showRomalrc" @update:model-value="lyricsSettings.state.showRomalrc = $event; lyricsSettings.save()" />
                  </div>
                </div>
              </div>
            </div>
          </transition>
        </Teleport>

        <AnimatedAppear v-if="lyricsSettings.state.showMiniBar" tag="div" variant="content" rhythm="overlay" class-name="bottom-console" :class="{ 'ui-hidden': !uiRevealed }" @mouseenter="freeze" @mouseleave="unfreeze">
          <div class="cc-left">
            <button class="con-btn" @click="playerStore.closeExpanded()" data-tooltip="收起播放页" aria-label="收起播放页"><ChevronDown :size="18" /></button>
            <button class="con-btn con-fav" :class="{ saved: isCurrentLiked }" type="button" :data-tooltip="isCurrentLiked ? '取消收藏' : '收藏'" :aria-label="isCurrentLiked ? '取消收藏' : '收藏'" :disabled="likeLoading || !canToggleCurrentLike" @click="toggleCurrentLike"><Heart :size="14" /></button>
            <button class="con-btn" @click="playerStore.cyclePlayMode()" :data-tooltip="playerStore.state.playMode === 'loop' ? '列表循环' : playerStore.state.playMode === 'single' ? '单曲循环' : '随机播放'" aria-label="切换播放模式"><Repeat v-if="playerStore.state.playMode === 'loop'" :size="14" /><Repeat1 v-else-if="playerStore.state.playMode === 'single'" :size="14" /><Shuffle v-else :size="14" /></button>
            <button class="con-btn" :class="{ active: showComments }" :disabled="!canComment" @click="showComments = !showComments" data-tooltip="评论区" aria-label="评论区">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
            </button>
          </div>
          <div class="cc-center">
            <template v-if="isPersonalFmCurrentTrack">
              <button class="con-btn con-dislike" @click="dislikeFmTrack" aria-label="不喜欢并切换下一首"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M10.8 5.5H6.9c-.93 0-1.74.64-1.95 1.54l-1.14 4.9a2 2 0 0 0 1.95 2.46h3.38l-.53 3.92a1.85 1.85 0 0 0 3.4 1.18l4.3-6.14c.2-.28.3-.62.3-.97V7.4a1.9 1.9 0 0 0-1.9-1.9h-3.9Zm7.15 0h1.65A1.4 1.4 0 0 1 21 6.9v6.95a1.4 1.4 0 0 1-1.4 1.4h-1.65V5.5Z"/></svg></button>
            </template>
            <template v-else>
              <button class="con-btn" @click="playerStore.prev()" aria-label="上一首"><SkipBack :size="14" /></button>
            </template>
            <button class="con-btn con-play" @click="playerStore.togglePlay()" aria-label="播放或暂停">{{ playerStore.state.isPlaying ? '❚❚' : '▶' }}</button>
            <button class="con-btn" @click="playerStore.next()" aria-label="下一首"><SkipForward :size="14" /></button>
          </div>
          <div class="console-progress">
            <span class="console-time">{{ formatTime(playerStore.state.currentTime) }}</span>
            <input class="console-bar" type="range" min="0" :max="Math.max(1, Math.floor(playerStore.state.duration || 0))" :value="Math.floor(playerStore.state.currentTime || 0)" @mousedown="onSeekStart" @touchstart.passive="onSeekStart" @input="onSeek" @change="onSeekEnd" @mouseup="onSeekEnd" @touchend="onSeekEnd" />
            <span class="console-time">{{ formatTime(playerStore.state.duration) }}</span>
          </div>
          <div class="cc-right">
            <button class="con-btn" :class="{ active: showEqPanel }" title="均衡器" @click="showEqPanel = !showEqPanel"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="4" y1="21" x2="4" y2="14"/><line x1="4" y1="10" x2="4" y2="3"/><line x1="12" y1="21" x2="12" y2="12"/><line x1="12" y1="8" x2="12" y2="3"/><line x1="20" y1="21" x2="20" y2="16"/><line x1="20" y1="12" x2="20" y2="3"/><circle cx="4" cy="12" r="2"/><circle cx="12" cy="10" r="2"/><circle cx="20" cy="14" r="2"/></svg></button>
            <button v-if="isLocalCurrentTrack" class="con-btn lyric-match-btn" type="button" data-tooltip="歌词匹配" aria-label="歌词匹配" @click="showLyricMatchDialog = true">词</button>
            <button v-if="playerStore.state.isIntelligenceActive &amp;&amp; uiStore.state.showIntelligenceIndicator" class="con-btn intel-icon" type="button" aria-label="心动模式"><Sparkles :size="10" /></button>
            <button v-if="isPersonalFmCurrentTrack" class="con-btn con-fm-label" type="button" aria-label="当前为私人 FM" disabled>FM</button>
            <button v-else class="con-btn" @click="uiStore.togglePlayQueue()" data-tooltip="查看播放列表" aria-label="查看播放列表"><AlignJustify :size="14" /></button>
            <div class="con-volume">
              <button class="con-btn con-vol-icon" type="button" :aria-label="playerStore.state.muted ? '取消静音' : '静音'" @click="playerStore.toggleMute()"><VolumeX v-if="playerStore.state.muted || playerStore.state.volume === 0" :size="14" /><Volume v-else-if="playerStore.state.volume < 0.33" :size="14" /><Volume1 v-else-if="playerStore.state.volume < 0.66" :size="14" /><Volume2 v-else :size="14" /></button>
              <input class="con-vol-slider" type="range" min="0" max="100" :value="Math.round((playerStore.state.muted ? 0 : playerStore.state.volume) * 100)" @input="onVolume" />
            </div>
          </div>
        </AnimatedAppear>

        <div v-if="showPlaylistPopup" class="playlist-popup-mask" @click.self="showPlaylistPopup = false">
          <aside class="playlist-popup" @click.stop>
            <div class="playlist-popup-head"><h3>播放列表</h3><div class="playlist-popup-actions"><button v-if="playerStore.state.playlist.length" class="ghost" title="清空列表" @click="onClearPlaylist">清空</button><button class="ghost" @click="showPlaylistPopup = false">关闭</button></div></div>
            <ul v-if="playerStore.state.playlist.length">
              <li v-for="(track, idx) in playerStore.state.playlist" :key="track.id" :class="{ active: idx === playerStore.state.currentIndex }" @click="playFromPopup(idx)">
                <span class="track-num">{{ idx + 1 }}</span>
                <img v-if="track.al?.picUrl" class="track-cover" :src="track.al.picUrl + '?param=48y48'" alt="" loading="lazy" />
                <span class="track-info"><span class="t">{{ track.name }}</span><span class="a">{{ (track.ar || []).map((x) => x.name).join('/') }}</span></span>
                <button class="track-remove-btn" title="移出列表" @click.stop="onRemoveTrack(idx)"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
              </li>
            </ul>
            <p v-else class="playlist-empty">列表为空</p>
          </aside>
        </div>
      </section>

      <LyricsSettingsPanel :visible="showSettings" :anchor="settingsAnchor" :accent-color="palette.c3" @close="showSettings = false" />
      <LyricsSelectionModal />
      <EqPanel :visible="showEqPanel" @close="showEqPanel = false" />
      <LocalLyricMatchDialog :visible="showLyricMatchDialog" :track="playerStore.state.currentTrack" @close="showLyricMatchDialog = false" />
    </div>
  </transition>
</template>

<script setup lang="ts">
import { AlignJustify, ChevronDown, Copy, Heart, Minus, Plus, Repeat, Repeat1, Settings, Shuffle, SkipBack, SkipForward, Sparkles, Volume, Volume1, Volume2, VolumeX } from 'lucide-vue-next';
import { computed, nextTick, ref, watch, onMounted, onBeforeUnmount } from 'vue';
import { toggleDjSubscribe, toggleSongLike, trashPersonalFm, deleteDjComment } from '../api/music';
import { usePlayerStore } from '../stores/player'
const playerStore = usePlayerStore();
import { useUiStore } from '../stores/ui';
const uiStore = useUiStore();
import { useUserStore } from '../stores/user';
const userStore = useUserStore();
import { useLyricsSettingsStore } from '../stores/lyricsSettings';
const lyricsSettings = useLyricsSettingsStore();
import { useIridescence, type IridescenceConfig } from '../composables/useIridescence';
import { useThreeScene } from '../composables/useThreeScene';
import { usePaperShaders } from '../composables/usePaperShaders';
import { useMistBackground } from '../composables/useMistBackground';
import { useDigitalLoom } from '../composables/useDigitalLoom';
import { useSilkBackground } from '../composables/useSilkBackground';
import { useAuroraShader } from '../composables/useAuroraShader';
import { defineAsyncComponent } from 'vue';

const BackgroundRender = defineAsyncComponent(() =>
  import('@applemusic-like-lyrics/vue').then(m => m.BackgroundRender)
);
import AnimatedAppear from './AnimatedAppear.vue';
import LyricsPanel from './LyricsPanel.vue';
import LyricsSettingsPanel from './LyricsSettingsPanel.vue';
import LyricsSelectionModal from './LyricsSelectionModal.vue';
import LocalLyricMatchDialog from './LocalLyricMatchDialog.vue';
import CommentPanel from './CommentPanel.vue';
import * as api from '../api/music';
import { useLyricsSelectionStore } from '../stores/lyricsSelection';
import FancySwitch from './ui/FancySwitch.vue';
import EqPanel from './EqPanel.vue';
import { useProgressiveCover } from '../composables/useProgressiveCover';
import { useAutoHideUI } from '../composables/useAutoHideUI';
import { formatTime } from '../utils/formatTime';
import { useCurrentTrackLike } from '../composables/useCurrentTrackLike';
import { platform } from '../utils/platform';

const emit = defineEmits<{ 'open-artist': [artist: Record<string, any>]; 'open-album': [albumId: number]; 'open-user': [userId: number]; 'open-podcast-detail': [item: any] }>();

const artistText = computed(() => { const ar = playerStore.state.currentTrack?.ar || []; return ar.length ? ar.map((a) => a.name).join('/') : 'Unknown Artist'; });
function openArtist(artist: Record<string, any>) { const id = Number(artist?.id || artist?.artistId || 0); if (id) emit('open-artist', artist); }
function openAlbum(albumId: number | undefined | null) {
  const id = Number(albumId || 0);
  if (id > 0) emit('open-album', id);
}
const coverStyle = computed(() => { const url = playerStore.state.currentTrack?.al?.picUrl; return url ? { backgroundImage: `url(${url})` } : {}; });
const { showFinal: coverLoaded } = useProgressiveCover(() => playerStore.state.currentTrack?.al?.picUrl || '', { targetSize: 'large' });
const { uiRevealed, onActivity, onLeave, freeze, unfreeze } = useAutoHideUI(() => uiStore.state.autoHidePlayerUI, { idleTimeout: 3000 });
function openUser(userId: number) { if (userId > 0) emit('open-user', userId); }
function openPodcastDetail() {
  const rid = currentPodcastRid.value;
  if (rid > 0) emit('open-podcast-detail', { radio: { id: rid }, name: currentAlbumName });
}

const currentCover = computed(() => playerStore.state.currentTrack?.al?.picUrl || '');
const currentArtistList = computed(() => playerStore.state.currentTrack?.ar || []);
const currentAlbumName = computed(() => playerStore.state.currentTrack?.al?.name || '');
const currentAlbumId = computed(() => { const al: any = playerStore.state.currentTrack?.al; return al?.id ? Number(al.id) : 0; });

const palette = ref({ c1: 'rgb(28, 33, 53)', c2: 'rgb(84, 110, 126)', c3: 'rgb(195, 156, 118)', c4: 'rgb(20, 24, 36)' });
const showPlaylistPopup = ref(false);
const showSettings = ref(false);
const showOffsetPanel = ref(false);
const showTransPanel = ref(false);
const showComments = ref(false);
const showEqPanel = ref(false);
const showLyricMatchDialog = ref(false);
const settingsAnchor = ref({ top: 0, right: 0 });
const gearBtnRef = ref<HTMLElement | null>(null);
const offsetPopoverStyle = ref<Record<string, string>>({});
const transPopoverStyle = ref<Record<string, string>>({});

const playerTransitionName = computed(() => {
  switch (uiStore.state.playerPageTransition) {
    case '景深推进':
      return 'player-depth';
    case '液态扩散':
      return 'player-liquid';
    case '幕布揭开':
      return 'player-curtain';
    default:
      return 'player-sheet';
  }
});

const isFullscreen = ref(false);
const isLocalCurrentTrack = computed(() => playerStore.state.currentTrack?.source === 'local');
function toggleFullscreen() {
  if (platform.isDesktop) {
    document.title = (isFullscreen.value ? 'cmd:fullscreen-leave:' : 'cmd:fullscreen-enter:') + Date.now();
    return;
  }

  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen().then(() => { isFullscreen.value = true; }).catch(() => {});
  } else {
    document.exitFullscreen().then(() => { isFullscreen.value = false; }).catch(() => {});
  }
}
onMounted(() => {
  document.addEventListener('fullscreenchange', onFsChange);
  document.addEventListener('webkitfullscreenchange', onFsChange);
  if (!platform.isDesktop) return;

  isFullscreen.value = 'winFullscreen' in document.documentElement.dataset;
  const observer = new MutationObserver(() => {
    isFullscreen.value = 'winFullscreen' in document.documentElement.dataset;
  });
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['data-win-fullscreen'],
  });
  (window as any).__playerFsObserver = observer;
});
onBeforeUnmount(() => {
  document.removeEventListener('fullscreenchange', onFsChange);
  document.removeEventListener('webkitfullscreenchange', onFsChange);
  (window as any).__playerFsObserver?.disconnect();
  delete (window as any).__playerFsObserver;
});
function onFsChange() {
  if (platform.isDesktop) return;
  isFullscreen.value = !!document.fullscreenElement;
}

// ── 桌面端窗口控制 ──
const isWinMaximized = ref(false);

function minimizeWindow() {
  document.title = 'cmd:minimize:' + Date.now();
}
function maximizeWindow() {
  document.title = (isWinMaximized.value ? 'cmd:restore:' : 'cmd:maximize:') + Date.now();
}
function closeWindow() {
  window.close();
}

onMounted(() => {
  if (!platform.isDesktop) return;
  isWinMaximized.value = 'winMaximized' in document.documentElement.dataset;
  const observer = new MutationObserver(() => {
    isWinMaximized.value = 'winMaximized' in document.documentElement.dataset;
  });
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['data-win-maximized'],
  });
  // cleanup 注册到 onBeforeUnmount
  (window as any).__playerWinObserver = observer;
});

onBeforeUnmount(() => {
  (window as any).__playerWinObserver?.disconnect();
  delete (window as any).__playerWinObserver;
});

function updateOffsetPopoverStyle() {
  const popoverHeight = 220;
  const maxTopPx = window.innerHeight - popoverHeight - 16;
  if (maxTopPx < 0) return;
  const centeredTop = Math.floor(window.innerHeight / 2 - popoverHeight / 2);
  offsetPopoverStyle.value = { top: `${Math.min(centeredTop, maxTopPx)}px` };
}

function updateTransPopoverStyle() {
  const popoverHeight = 140;
  const maxTopPx = window.innerHeight - popoverHeight - 16;
  if (maxTopPx < 0) return;
  const centeredTop = Math.floor(window.innerHeight / 2 - popoverHeight / 2);
  transPopoverStyle.value = { top: `${Math.min(centeredTop, maxTopPx)}px` };
}

watch(showOffsetPanel, (v) => {
  if (v) nextTick(() => updateOffsetPopoverStyle());
  else offsetPopoverStyle.value = {};
});

watch(showTransPanel, (v) => {
  if (v) nextTick(() => updateTransPopoverStyle());
  else transPopoverStyle.value = {};
});

function onOpenSettings() {
  const btn = gearBtnRef.value;
  if (btn) { const r = btn.getBoundingClientRect(); settingsAnchor.value = { top: r.top - 8, right: window.innerWidth - r.left + 12 }; }
  showSettings.value = true;
}

const isPersonalFmCurrentTrack = computed(() => playerStore.isPersonalFmTrack(playerStore.state.currentTrack));
const {
  currentTrackId,
  currentPodcastRid,
  isCurrentPodcast,
  canToggleCurrentLike,
  isCurrentLiked,
  likeLoading,
  toggleCurrentLike,
} = useCurrentTrackLike();
const currentPodcastProgramId = computed(() => Number(playerStore.state.currentTrack?.podcast?.programId || 0));
const podcastPublishTime = computed(() => {
  const t = Number(playerStore.state.currentTrack?.podcast?.createTime || 0);
  if (!t) return '';
  const d = new Date(t);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
});
const commentResourceId = computed(() => isCurrentPodcast.value && currentPodcastProgramId.value > 0 ? currentPodcastProgramId.value : (currentTrackId.value > 0 ? currentTrackId.value : 0));
const commentResourceType = computed(() => isCurrentPodcast.value ? 4 : 0);
const commentFetcher = computed(() => isCurrentPodcast.value ? api.getDjComments : api.getSongComments);
const commentDeleter = computed(() => isCurrentPodcast.value ? deleteDjComment : api.deleteSongComment);
const canComment = computed(() => currentTrackId.value > 0);

const isSeeking = ref(false);
const seekPreviewTime = ref(0);

/* ---- custom background modes ---- */
const iriContainerRef = ref<HTMLElement | null>(null);
const showIridescence = computed(() => lyricsSettings.state.bgMode === 'custom' && lyricsSettings.state.bgCustomMode === 'iridescence');
const showSoftGradient = computed(() => lyricsSettings.state.bgMode === 'custom' && lyricsSettings.state.bgCustomMode === 'soft-gradient');
const softGradientDuration = computed(() => {
  const speed = lyricsSettings.state.iriSpeed || 5;
  return 12 - speed;
});
const threeSceneRef = ref<HTMLElement | null>(null);
const showThreeScene = computed(() => lyricsSettings.state.bgMode === 'custom' && lyricsSettings.state.bgCustomMode === 'three-scene');
const threeSceneActive = computed(() => showThreeScene.value && playerStore.state.expanded);
useThreeScene(threeSceneRef, threeSceneActive);
const paperRef = ref<HTMLElement | null>(null);
const showPaper = computed(() => lyricsSettings.state.bgMode === 'custom' && lyricsSettings.state.bgCustomMode === 'paper-shaders');
const paperActive = computed(() => showPaper.value && playerStore.state.expanded);
const paperConfig = computed(() => ({
  color1: lyricsSettings.state.iriColors?.[0] || '#3A29FF',
  color2: lyricsSettings.state.iriColors?.[1] || '#FF94B4',
  color3: lyricsSettings.state.iriColors?.[2] || '#FF3232',
  color4: lyricsSettings.state.iriColors?.[3] || '#1a1a2e',
  speed: (lyricsSettings.state.iriSpeed || 5) / 10,
}));
usePaperShaders(paperRef, paperConfig, paperActive);
const mistRef = ref<HTMLElement | null>(null);
const showMist = computed(() => lyricsSettings.state.bgMode === 'custom' && lyricsSettings.state.bgCustomMode === 'mist');
const mistActive = computed(() => showMist.value && playerStore.state.expanded);
useMistBackground(mistRef, mistActive);
const loomRef = ref<HTMLElement | null>(null);
const showLoom = computed(() => lyricsSettings.state.bgMode === 'custom' && lyricsSettings.state.bgCustomMode === 'digital-loom');
const loomActive = computed(() => showLoom.value && playerStore.state.expanded);
useDigitalLoom(loomRef, loomActive);
const silkRef = ref<HTMLElement | null>(null);
const showSilk = computed(() => lyricsSettings.state.bgMode === 'custom' && lyricsSettings.state.bgCustomMode === 'silk');
const silkActive = computed(() => showSilk.value && playerStore.state.expanded);
useSilkBackground(silkRef, silkActive);
const auroraRef = ref<HTMLElement | null>(null);
const showAurora = computed(() => lyricsSettings.state.bgMode === 'custom' && lyricsSettings.state.bgCustomMode === 'aurora');
const auroraActive = computed(() => showAurora.value && playerStore.state.expanded);
useAuroraShader(auroraRef, auroraActive);

/* ---- AMLL fluid background ---- */
const showAmllFluid = computed(() => lyricsSettings.state.bgMode === 'custom' && lyricsSettings.state.bgCustomMode === 'amll-fluid');
const amllFluidSpeed = computed(() => {
  const speed = lyricsSettings.state.iriSpeed || 5;
  return speed / 5; // 0-10 → 0-2
});
const iriConfig = computed((): IridescenceConfig => {
  const toRgb = (hex: string) => { const h = (hex || '#3A29FF').replace('#',''); return [parseInt(h.substring(0,2),16)/255, parseInt(h.substring(2,4),16)/255, parseInt(h.substring(4,6),16)/255] as [number,number,number]; };
  return {
    color1: toRgb(lyricsSettings.state.iriColors?.[0]),
    color2: toRgb(lyricsSettings.state.iriColors?.[1]),
    color3: toRgb(lyricsSettings.state.iriColors?.[2]),
    speed: (lyricsSettings.state.iriSpeed || 5) / 10,
    amplitude: (lyricsSettings.state.iriScale || 5) / 10,
  };
});
const iriActive = computed(() => showIridescence.value && playerStore.state.expanded);
useIridescence(iriContainerRef, iriConfig, iriActive);

const iriBlurStyle = computed(() => {
  const px = ((lyricsSettings.state.iriBlur || 0) / 10) * 24;
  return { backdropFilter: `blur(${px}px)`, WebkitBackdropFilter: `blur(${px}px)` };
});

const coverAuraStyle = computed(() => { const url = playerStore.state.currentTrack?.al?.picUrl; return url ? { backgroundImage: `url(${url})` } : {}; });

/* settings-driven */
const showLeftZone = computed(() => lyricsSettings.state.showCover && lyricsSettings.state.displayMode !== 'fullscreen');
const showLeftControls = computed(() => !lyricsSettings.state.showMiniBar);

const displayMode = computed(() => lyricsSettings.state.displayMode);
const isCustomBg = computed(() => lyricsSettings.state.bgMode === 'custom');

const panelBodyStyle = computed(() => {
  if (!lyricsSettings.state.showCover || lyricsSettings.state.displayMode === 'fullscreen') return { display: 'grid', gridTemplateColumns: '1fr', gridTemplateRows: 'auto 1fr', rowGap: 'var(--space-3)' };
  if (!lyricsSettings.state.showLyrics) return { display: 'grid', gridTemplateColumns: '1fr' };
  return { display: 'grid', gridTemplateColumns: '40% 60%', gap: '24px' };
});

function getLuminance(rgb: string): number {
  const m = rgb.match(/\d+/g);
  if (!m) return 0.5;
  const [r, g, b] = m.map(Number);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}

const bgStyle = computed(() => {
  const { bgMode } = lyricsSettings.state;
  // 自定义模式 → 虹彩效果由 canvas 渲染
  if (bgMode === 'custom') {
    if (lyricsSettings.state.bgCustomMode === 'soft-gradient') {
      return {
        background: '#0a0c14',
        '--panel-bg': 'rgba(0,0,0,0.3)',
        '--panel-bg-soft': 'rgba(0,0,0,0.2)',
        '--card-bg': 'rgba(18,20,28,0.92)',
        '--card-bg-2': 'rgba(24,26,36,0.94)',
        '--line-muted': 'rgba(255,255,255,0.12)',
        '--accent': palette.value.c3,
        '--overlay-text-main': '#e7e5e4',
        '--overlay-text-sub': '#b8c6d8',
        '--overlay-text-soft': '#93a5bb',
      };
    }
    return {
      background: '#0a0c14',
      '--panel-bg': 'rgba(0,0,0,0.3)',
      '--panel-bg-soft': 'rgba(0,0,0,0.2)',
      '--card-bg': 'rgba(18,20,28,0.92)',
      '--card-bg-2': 'rgba(24,26,36,0.94)',
      '--line-muted': 'rgba(255,255,255,0.12)',
      '--accent': palette.value.c3,
      '--overlay-text-main': '#e7e5e4',
      '--overlay-text-sub': '#b8c6d8',
      '--overlay-text-soft': '#93a5bb',
    };
  }
  // 基础模式（仅默认主题）
  const lum = getLuminance(palette.value.c1);
  const isLight = lum > 0.55;
  return {
    background: `linear-gradient(160deg, ${palette.value.c1} 0%, ${palette.value.c2} 42%, ${palette.value.c4} 100%)`,
    '--panel-bg': palette.value.c1, '--panel-bg-soft': palette.value.c2,
    '--card-bg': 'rgba(18,20,28,0.96)', '--card-bg-2': 'rgba(24,26,36,0.98)',
    '--line-muted': 'rgba(255,255,255,0.16)', '--accent': palette.value.c3,
    '--overlay-text-main': isLight ? '#1c1917' : '#e7e5e4',
    '--overlay-text-sub': isLight ? '#57534e' : '#b8c6d8',
    '--overlay-text-soft': isLight ? '#78716c' : '#93a5bb',
  };
});

async function dislikeFmTrack() {
  const track = playerStore.state.currentTrack;
  const id = Number(track?.id || 0);
  if (!id) return;
  try { await trashPersonalFm(id, userStore.state.loginCookie || undefined); } catch { /* ignore */ }
  playerStore.next();
}
async function extractPaletteFromCover(url?: string) {
  if (!url) return;
  const img = new Image(); img.crossOrigin = 'anonymous'; img.referrerPolicy = 'no-referrer'; img.src = url;
  await new Promise<void>((resolve, reject) => { img.onload = () => resolve(); img.onerror = () => reject(); });
  const canvas = document.createElement('canvas'); const size = 56; canvas.width = size; canvas.height = size;
  const ctx = canvas.getContext('2d'); if (!ctx) return;
  ctx.drawImage(img, 0, 0, size, size); const { data } = ctx.getImageData(0, 0, size, size);
  let r = 0, g = 0, b = 0, n = 0;
  for (let i = 0; i < data.length; i += 4) { if (data[i + 3] < 40) continue; r += data[i]; g += data[i + 1]; b += data[i + 2]; n += 1; }
  if (!n) return;
  const ar = Math.round(r / n), ag = Math.round(g / n), ab = Math.round(b / n);
  const clamp = (x: number) => Math.max(0, Math.min(255, x));
  const tone = (dr: number, dg: number, db: number) => `rgb(${clamp(ar + dr)},${clamp(ag + dg)},${clamp(ab + db)})`;
  palette.value = { c1: tone(-52, -46, -40), c2: tone(-8, -4, 6), c3: tone(42, 34, 26), c4: tone(-86, -80, -72) };
}

watch(() => playerStore.state.currentTrack?.al?.picUrl, async (url) => { try { await extractPaletteFromCover(url); } catch { /* keep previous */ } }, { immediate: true });

/* 切歌过渡动画 */
const prevBg = ref('');
const bgFadeOpacity = ref(0);
let transitionTimer: ReturnType<typeof setTimeout> | null = null;
const trackId = computed(() => playerStore.state.currentTrack?.id);

watch(trackId, (newId, oldId) => {
  if (!oldId || newId === oldId) return;
  // 捕获当前背景作为旧层
  const curBg = bgStyle.value?.background;
  if (curBg && curBg !== '#0a0c14') {
    prevBg.value = curBg;
    bgFadeOpacity.value = 1;
    // 旧背景 500ms 淡出
    if (transitionTimer) clearTimeout(transitionTimer);
    requestAnimationFrame(() => { bgFadeOpacity.value = 0; });
    transitionTimer = setTimeout(() => { prevBg.value = ''; }, 600);
  }
});

function onVolume(e: Event) { playerStore.setVolume(Number((e.target as HTMLInputElement).value) / 100); }
function onSeekStart() { isSeeking.value = true; seekPreviewTime.value = playerStore.state.currentTime || 0; }
function onSeek(e: Event) { const t = Number((e.target as HTMLInputElement).value); seekPreviewTime.value = t; playerStore.seek(t); }
function onSeekEnd() { seekPreviewTime.value = playerStore.state.currentTime || 0; setTimeout(() => { isSeeking.value = false; }, 80); }

function scrollPlaylistIntoView() { if (!isPersonalFmCurrentTrack.value) showPlaylistPopup.value = true; }
async function playFromPopup(index: number) { await playerStore.playByIndex(index); showPlaylistPopup.value = false; }
function onRemoveTrack(index: number) { playerStore.removeFromPlaylist(index); }
function onClearPlaylist() { playerStore.clearPlaylist(); showPlaylistPopup.value = false; }
const editingOffset = ref(false);
const offsetInputRef = ref<HTMLInputElement | null>(null);

function startEditOffset() { editingOffset.value = true; nextTick(() => offsetInputRef.value?.focus()); }
function commitOffset(e: Event) {
  const v = Number((e.target as HTMLInputElement).value);
  if (!isNaN(v)) { playerStore.resetLyricsOffset(); playerStore.adjustLyricsOffset(Math.max(-10, Math.min(10, v))); }
  editingOffset.value = false;
}

function copyTrackInfo() { const t = playerStore.state.currentTrack; if (!t?.name) return; navigator.clipboard.writeText(`${t.name} - ${(t.ar||[]).map(a=>a.name).join('/')}`); }
function onOpenLyricsSelection() { useLyricsSelectionStore().openSelection(playerStore.state.currentTrack?.id ?? null); }
function formatOffset(v: number) { if (v === 0) return '0s'; const sign = v > 0 ? '+' : ''; return `${sign}${v.toFixed(1)}s`; }
</script>

<style scoped>
.expanded-wrap { position: fixed; inset: 0; z-index: 60; overflow: hidden; transition: background 0.5s ease; }
.cover-aura { position: absolute; inset: -8%; background: center/cover no-repeat; filter: blur(48px) saturate(130%); transform: scale(1.08); opacity: 0.18; pointer-events: none; transition: opacity 0.5s ease; }
.bg-transition-layer { position: absolute; inset: 0; z-index: 0; pointer-events: none; transition: opacity 0.5s ease; }
.expanded-panel { position: relative; z-index: 2; width: 100vw; height: 100vh; padding: var(--space-4) var(--space-6) var(--space-5); box-sizing: border-box; display: grid; grid-template-rows: auto 1fr auto; gap: 0; }
.panel-head { display: flex; align-items: center; margin-bottom: var(--space-3); }
.panel-head-right { display: flex; align-items: center; gap: 6px; margin-left: auto; }
.cover-hidden-head { text-align: center; padding: var(--space-4) var(--space-4) 0; }
.song-name-center { margin: 0; color: #fff !important; font-size: var(--text-headline-lg); font-weight: 700; line-height: 1.2; }
.song-artist-center { margin: var(--space-1) 0 0; color: rgba(255,255,255,0.82) !important; font-size: var(--text-body-lg); }
.song-artist-center .rate-badge { margin-left: 8px; }
.ghost { height: 32px; border-radius: 10px; border: 1px solid var(--line-muted); background: var(--card-bg-2); color: #fff; padding: 0 var(--space-3); }
.artist-inline-btn { background: none; border: none; color: inherit; padding: 0; font: inherit; cursor: pointer; outline: none; }
.artist-inline-btn:focus-visible { outline: none; }
.panel-body { min-height: 0; overflow: hidden; display: grid; grid-template-columns: 40% 60%; gap: 24px; align-items: start; }
.left-zone { width: 100%; box-sizing: border-box; align-self: center; display: grid; justify-items: center; gap: var(--space-2); padding: var(--space-2) 0 var(--space-2) var(--space-4); }
.left-zone.l-only-cover { padding: var(--space-2) 0 var(--space-2) var(--space-4); }
.album-shell { width: 480px; height: 480px; border-radius: 24px; padding: 0; background: transparent; border: none; box-shadow: none; transform: scale(0.92); transition: transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1); position: relative; }
.album-shell.playing { transform: scale(1); }
.album-cover { width: 100%; height: 100%; border-radius: 18px; background: #d9dee8 center/cover no-repeat; }
.album-cover-logo { position: absolute; inset: 0; width: 100%; height: 100%; display: block; border-radius: 18px; }
.album-cover.bg-loaded ~ .album-cover-logo { display: none; }
.song-name { width: 480px; margin: var(--space-2) 0 0; color: #ffffff !important; font-size: var(--text-headline-lg); font-weight: 700; text-align: center;  }
.song-artist { width: 480px; margin: 0; color: rgba(255,255,255,0.82); text-align: center;  }
.progress-wrap { width: 300px; display: grid; gap: var(--space-1); position: relative; }
.progress { width: 100%; }
.seek-preview { justify-self: center; padding: 2px 8px; border-radius: 999px; font-size: var(--text-label-sm); color: #fff; background: rgba(0,0,0,0.38); border: 1px solid rgba(255,255,255,0.18); backdrop-filter: blur(6px); animation: seek-fade-in 120ms ease; }
.times { display: flex; justify-content: space-between; }
.time { color: rgba(255,255,255,0.78); font-size: var(--text-label-sm); }
.controls { width: 300px; height: 52px; display: flex; justify-content: center; align-items: center; gap: var(--space-3); margin-top: var(--space-1);  }
.ctrl { width: 42px; height: 42px; border-radius: 50%; color: #fff; display: inline-grid; place-items: center; line-height: 1; transition: transform 0.16s ease, box-shadow 0.16s ease, background 0.16s ease; }
.ctrl:not(.main) { border: none; background: transparent; box-shadow: none; color: #ffffff; }
.ctrl-fm-indicator { width: auto; height: 42px; padding: 0 4px; font-size: var(--text-label-md); font-weight: 800; letter-spacing: 0.08em; border: none !important; border-radius: 0; background: transparent !important; box-shadow: none !important; color: #fff7d6 !important; text-shadow: 0 0 10px rgba(255,244,194,0.35); cursor: default; pointer-events: none; }
.ctrl-dislike { color: #fff !important; }
.ctrl-dislike:hover { color: rgba(255,255,255,0.7) !important; }
.con-dislike { color: #fff !important; }
.ctrl:not(.main) :deep(svg) { color: #ffffff; stroke: currentColor; }
.ctrl:not(.main):hover { transform: translateY(-1px); }
.ctrl:not(.main):active { transform: translateY(0); }
.ctrl.main { width: 52px; height: 52px; border: 1px solid color-mix(in srgb, var(--panel-bg-soft) 36%, #ffffff33); background: color-mix(in srgb, var(--panel-bg-soft) 52%, #f1d1b4 48%); box-shadow: 0 12px 22px rgba(0,0,0,0.34), inset 0 1px 0 rgba(255,255,255,0.34); }
.volume-wrap { width: 300px; display: flex; justify-content: space-between; gap: var(--space-3); align-items: center; color: rgba(255,255,255,0.8);  }
.volume-control { min-width: 0; flex: 1 1 auto; display: flex; justify-content: center; gap: var(--space-2); align-items: center; }
.volume-control input { min-width: 0; flex: 1 1 auto; max-width: 110px; }
.volume-icon-btn { width: 28px; height: 28px; border: none; background: transparent; color: rgba(255,255,255,0.8); cursor: pointer; display: inline-grid; place-items: center; border-radius: 6px; transition: color 0.16s ease, background 0.16s ease; flex-shrink: 0; }
.volume-icon-btn:hover { color: #fff; background: rgba(255,255,255,0.08); }
.favorite-ctrl { flex: 0 0 42px; border: none !important; background: transparent !important; box-shadow: none !important; outline: none; }
.favorite-ctrl.saved { color: #ff6b8a !important; }
.favorite-ctrl.saved :deep(svg) { fill: currentColor; }
.intel-icon { flex: 0 0 42px; border: none !important; background: transparent !important; box-shadow: none !important; outline: none; }
.volume-ctrl-comment { flex: 0 0 42px; border: none !important; background: transparent !important; box-shadow: none !important; outline: none; order: 1; }
.volume-ctrl-comment.active { color: var(--accent, #fff) !important; }
/* iridescence canvas */
.iri-container { position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; z-index: 0; }
.iri-container :deep(canvas) { width: 100% !important; height: 100% !important; display: block; }
.iri-blur { position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; z-index: 1; background: transparent; }
.three-scene-container { position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; z-index: 0; }
.three-scene-container :deep(canvas) { width: 100% !important; height: 100% !important; display: block; }
.paper-container { position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; z-index: 0; }
.paper-container { position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; z-index: 0; }
.paper-container :deep(canvas) { width: 100% !important; height: 100% !important; display: block; }
.mist-container { position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; z-index: 0; }
.mist-container { position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; z-index: 0; }
.mist-container :deep(canvas) { width: 100% !important; height: 100% !important; display: block; }
.loom-container { position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; z-index: 0; }
.silk-container { position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; z-index: 0; }
.aurora-container { position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; z-index: 0; }
.amll-fluid-container { position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; z-index: 0; }
.amll-fluid-container :deep(canvas) { width: 100% !important; height: 100% !important; display: block; object-fit: cover; }
.aurora-container :deep(canvas) { width: 100% !important; height: 100% !important; display: block; }
/* right actions */
.right-actions { position: fixed; right: 16px; top: 50%; transform: translateY(-50%); display: flex; flex-direction: column; align-items: center; gap: var(--space-3); z-index: 65; }
.ra-btn {
  width: 44px; height: 44px; border-radius: 50%; border: none;
  background: transparent; color: rgba(255,255,255,0.5);
  cursor: pointer; display: grid; place-items: center;
  font-size: var(--text-label-sm); font-weight: 700;
  transition: color 120ms ease, background 120ms ease;
  flex-shrink: 0;
}
.ra-btn svg { width: 22px; height: 22px; stroke-width: 2.5; }
.ra-btn:hover { color: #fff; background: rgba(255,255,255,0.1); }
.ra-btn--rect { border-radius: 10px; font-size: var(--text-label-md); width: 44px; }
.ra-btn-trans { font-size: var(--text-body-md); font-weight: 800; letter-spacing: 0.02em; }
.ra-btn-trans.active { color: var(--accent, #c39c76); }
.ra-icon { position: relative; display: grid; place-items: center; }
.ra-badge {
  position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%);
  font-size: 9px; font-weight: 800;
  color: rgba(255,255,255,0.85);
  pointer-events: none;
}
/* offset popover */
.offset-mask { position: fixed; inset: 0; z-index: 110; background: transparent; }
.offset-popover {
  position: fixed; right: 60px;
  width: 200px; padding: var(--space-3) var(--space-4);
  background: var(--bg-solid, #1a1c28);
  border: 1px solid var(--border, rgba(255,255,255,0.12));
  border-radius: var(--radius-lg, 14px);
  box-shadow: 0 8px 32px rgba(0,0,0,0.45);
  display: grid; gap: var(--space-2);
  transform-origin: right center;
  animation: an-offset-in 0.2s cubic-bezier(0.22,1,0.36,1);
}
.offset-head { color: var(--text-main,#fff); font-size: var(--text-label-sm); font-weight: 600; letter-spacing: 0.04em; text-align: center; }
.offset-body { display: flex; align-items: center; justify-content: center; gap: var(--space-2); }
.of-step {
  width: 36px; height: 36px; border-radius: 50%; border: 1px solid var(--border-soft, rgba(255,255,255,0.12));
  background: transparent; color: rgba(255,255,255,0.7);
  cursor: pointer; display: grid; place-items: center;
  transition: all 120ms ease; flex-shrink: 0;
}
.of-step:hover { background: rgba(255,255,255,0.1); color: #fff; border-color: rgba(255,255,255,0.3); }
.of-step svg { stroke-width: 2.5; }
.of-value {
  color: var(--accent,#c39c76); font-size: 24px; font-weight: 800; font-variant-numeric: tabular-nums;
  min-width: 72px; text-align: center; cursor: pointer; padding: 2px 6px; border-radius: 6px;
  transition: background 120ms ease;
}
.of-value:hover { background: rgba(255,255,255,0.06); }
.of-input {
  width: 72px; text-align: center; font-size: 20px; font-weight: 800;
  background: rgba(255,255,255,0.08); border: 1px solid var(--accent,#c39c76);
  color: var(--accent,#c39c76); border-radius: 8px; padding: 4px 6px;
  outline: none; font-variant-numeric: tabular-nums; -moz-appearance: textfield;
}
.of-input::-webkit-inner-spin-button,
.of-input::-webkit-outer-spin-button { -webkit-appearance: none; margin: 0; }
.of-hint { color: var(--text-soft, rgba(255,255,255,0.4)); font-size: var(--text-label-xs); text-align: center; }
.of-reset-wrap { text-align: center; }
.of-reset {
  padding: 5px 14px; border-radius: 999px; border: 1px solid var(--border-soft, rgba(255,255,255,0.1));
  background: transparent; color: var(--text-soft, rgba(255,255,255,0.6)); font-size: var(--text-label-sm); cursor: pointer;
  transition: all 120ms ease;
}
.of-reset:hover { color: var(--accent,#c39c76); border-color: var(--accent, rgba(195,156,118,0.4)); }
.offset-fade-enter-active, .offset-fade-leave-active { transition: opacity 0.15s ease; }
.offset-fade-enter-from, .offset-fade-leave-to { opacity: 0; }
/* trans popover */
.trans-popover {
  position: fixed; right: 60px;
  width: 200px; padding: var(--space-3) var(--space-4);
  background: var(--bg-solid, #161823);
  border: 1px solid var(--border, rgba(255,255,255,0.12));
  border-radius: var(--radius-lg, 14px);
  box-shadow: 0 8px 32px rgba(0,0,0,0.45);
  display: grid; gap: var(--space-3);
  transform-origin: right center;
  animation: offset-in 0.2s cubic-bezier(0.22,1,0.36,1);
}
.trans-head { color: var(--text-main,#fff); font-size: var(--text-label-sm); font-weight: 600; letter-spacing: 0.04em; text-align: center; padding-bottom: var(--space-1); border-bottom: 1px solid var(--border, rgba(255,255,255,0.08)); }
.trans-body { display: flex; flex-direction: column; gap: var(--space-2); }
.trans-row { display: flex; align-items: center; justify-content: space-between; }
.trans-label { color: var(--text-main,#fff); font-size: 13px; font-weight: 500; }
/* bottom console */
.bottom-console {
  position: static;
  width: 100%;
  display: grid;
  gap: 2px;
  grid-template-columns: 1fr auto 1fr;
  grid-template-rows: auto 1fr;
  padding: 0 var(--space-5) var(--space-3);
  z-index: 70;
}
.console-progress { grid-column: 2; grid-row: 2; display: flex; align-items: center; gap: var(--space-2); justify-self: center; width: 175%; }
.console-time { color: rgba(255,255,255,0.5); font-size: var(--text-label-xs); min-width: 32px; font-variant-numeric: tabular-nums; }
.console-time:last-child { text-align: right; }
.console-bar { flex: 1; height: 10px; accent-color: var(--accent, #c39c76); cursor: pointer; border-radius: 5px; }
.cc-left { grid-column: 1; grid-row: 1 / 3; display: flex; align-items: flex-end; gap: var(--space-2); padding-bottom: 6px; }
.cc-center { grid-column: 2; grid-row: 1; display: flex; align-items: center; justify-content: center; gap: var(--space-2); padding-top: var(--space-2); }
.cc-right { grid-column: 3; grid-row: 1 / 3; display: flex; align-items: flex-end; justify-content: flex-end; gap: var(--space-2); padding-bottom: 6px; }
.cc-left .con-btn, .cc-right .con-btn { width: 44px; height: 44px; }
.cc-left .con-btn svg, .cc-right .con-btn svg { width: 22px; height: 22px; }
.cc-right .con-vol-icon { width: 40px; height: 40px; }
.cc-right .con-vol-icon svg { width: 20px; height: 20px; }
.cc-right .con-vol-slider { width: 88px; }
.cc-center { display: flex; align-items: center; gap: var(--space-2); }
.cc-center .con-btn { width: 44px; height: 44px; }
.cc-center .con-btn svg { width: 22px; height: 22px; }
.cc-center .con-play { width: 50px; height: 50px; font-size: var(--text-body-lg); }
.con-btn {
  width: 32px; height: 32px; border-radius: 50%; border: none;
  background: transparent; color: rgba(255,255,255,0.8);
  cursor: pointer; display: grid; place-items: center;
  font-size: var(--text-label-sm); transition: transform 0.12s ease, background 0.12s ease;
  flex-shrink: 0;
}
.con-btn:hover { transform: scale(1.12); background: rgba(255,255,255,0.1); }
.con-btn:disabled { opacity: 0.35; cursor: default; background: transparent !important; transform: none !important; }
.con-btn svg { stroke-width: 2.5; }
.con-btn:active { transform: scale(0.95); }
.con-play { width: 42px; height: 42px; background: rgba(255,255,255,0.15); font-size: var(--text-body-md); }
.con-play:hover { background: rgba(255,255,255,0.22); }
.con-fm-label { font-size: var(--text-label-md); font-weight: 700; letter-spacing: 0.04em; background: transparent !important; border-radius: 0 !important; opacity: 1 !important; cursor: default !important; }
.con-fm-label:hover { transform: none !important; background: transparent !important; }
.con-volume { display: flex; align-items: center; gap: 4px; }
.con-vol-icon { width: 28px; height: 28px; }
.con-vol-slider { width: 64px; height: 4px; accent-color: var(--accent, #c39c76); }
.con-fav.saved { color: var(--accent) !important; }
.con-fav.saved :deep(svg) { fill: currentColor; }
.lyric-match-btn { font-size: 15px; font-weight: 800; color: var(--accent, #c39c76); }
/* playlist popup */
.playlist-popup-mask { position: fixed; inset: 0; z-index: 90; background: rgba(0,0,0,0.38); display: grid; place-items: center; }
.playlist-popup { width: min(620px, calc(100vw - 32px)); max-height: min(70vh, 680px); border-radius: 16px; border: 1px solid var(--line-muted); background: linear-gradient(165deg, color-mix(in srgb, var(--panel-bg) 78%, #111 22%) 0%, color-mix(in srgb, var(--panel-bg-soft) 66%, #151822 34%) 55%, color-mix(in srgb, var(--panel-bg) 72%, #0c1018 28%) 100%); padding: var(--space-3); display: grid; grid-template-rows: auto 1fr; gap: var(--space-2); box-shadow: 0 18px 45px rgba(0,0,0,0.38); }
.playlist-popup-head { display: flex; align-items: center; justify-content: space-between; }
.playlist-popup-actions { display: flex; gap: var(--space-2); }
.playlist-popup h3 { margin: 0; color: #fff; }
.playlist-popup ul { margin: 0; padding: 0; list-style: none; overflow: auto; display: grid; gap: var(--space-1); }
.playlist-popup li { padding: var(--space-2) var(--space-2) var(--space-2) var(--space-3); border-radius: 10px; cursor: pointer; display: grid; grid-template-columns: auto 36px 1fr auto; align-items: center; gap: var(--space-2); border: 1px solid transparent; transition: background 120ms ease; }
.playlist-popup li.active { background: color-mix(in srgb, var(--panel-bg-soft) 42%, #ffffff12); border-color: var(--line-muted); }
.playlist-popup li:hover { background: color-mix(in srgb, var(--panel-bg-soft) 28%, #ffffff08); }
.track-num { color: rgba(255,255,255,0.35); font-size: var(--text-label-sm); width: 20px; text-align: center; flex-shrink: 0; }
.track-cover { width: 36px; height: 36px; border-radius: 6px; object-fit: cover; flex-shrink: 0; background: rgba(255,255,255,0.06); }
.track-info { min-width: 0; display: grid; gap: 2px; }
.t { color: #fff; font-size: 13px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.a { color: rgba(255,255,255,0.75); font-size: var(--text-label-sm); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.track-remove-btn { width: 28px; height: 28px; border: none; background: transparent; color: rgba(255,255,255,0.35); cursor: pointer; display: grid; place-items: center; border-radius: 6px; opacity: 0; transition: opacity 120ms ease, color 120ms ease, background 120ms ease; flex-shrink: 0; }
.playlist-popup li:hover .track-remove-btn { opacity: 1; }
.track-remove-btn:hover { color: rgba(255,100,100,0.9); background: rgba(255,100,100,0.12); }
.playlist-empty { color: rgba(255,255,255,0.35); text-align: center; padding: var(--space-6) 0; margin: 0; }
/* 切歌过渡 */
.cover-switch-enter-active, .cover-switch-leave-active { transition: opacity 0.3s ease, transform 0.3s ease; }
.cover-switch-enter-from { opacity: 0; transform: scale(0.95); }
.cover-switch-leave-to { opacity: 0; transform: scale(0.95); }
/* 封面显示/隐藏过渡 */
.zone-fade-enter-active, .zone-fade-leave-active { transition: opacity 0.25s ease; }
.zone-fade-enter-from, .zone-fade-leave-to { opacity: 0; }
.zone-slide-enter-active, .zone-slide-leave-active { transition: opacity 0.25s ease, transform 0.25s ease; }
.zone-slide-enter-from { opacity: 0; transform: translateX(-20px); }
.zone-slide-leave-to { opacity: 0; transform: translateX(-20px); }

.player-sheet-enter-active, .player-sheet-leave-active {
  transition: opacity 0.3s ease, transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
}
.player-sheet-enter-active .expanded-panel, .player-sheet-leave-active .expanded-panel {
  transition: transform 0.35s cubic-bezier(0.22, 1, 0.36, 1);
}
.player-sheet-enter-from, .player-sheet-leave-to {
  opacity: 0;
  transform: scale(0.96);
}
.player-sheet-enter-from .expanded-panel, .player-sheet-leave-to .expanded-panel {
  transform: translateY(100%);
}

.player-depth-enter-active,
.player-depth-leave-active {
  transition:
    opacity 0.34s ease,
    transform 0.38s cubic-bezier(0.22, 1, 0.36, 1),
    filter 0.38s ease;
  transform-origin: center center;
}

.player-depth-enter-active .expanded-panel,
.player-depth-leave-active .expanded-panel {
  transition:
    transform 0.38s cubic-bezier(0.22, 1, 0.36, 1),
    opacity 0.28s ease;
}

.player-depth-enter-from {
  opacity: 0;
  transform: scale(1.08);
  filter: blur(18px);
}

.player-depth-leave-to {
  opacity: 0;
  transform: scale(0.92);
  filter: blur(10px);
}

.player-depth-enter-from .expanded-panel {
  opacity: 0;
  transform: scale(0.94) translateY(18px);
}

.player-depth-leave-to .expanded-panel {
  opacity: 0;
  transform: scale(1.04) translateY(-10px);
}

.player-liquid-enter-active,
.player-liquid-leave-active {
  transition:
    opacity 0.42s ease,
    transform 0.44s cubic-bezier(0.16, 1, 0.3, 1),
    filter 0.44s ease;
}

.player-liquid-enter-active .expanded-panel,
.player-liquid-leave-active .expanded-panel {
  transition:
    opacity 0.32s ease,
    transform 0.44s cubic-bezier(0.16, 1, 0.3, 1);
}

.player-liquid-enter-from {
  opacity: 0;
  transform: scale(0.9);
  filter: blur(24px) saturate(160%);
}

.player-liquid-leave-to {
  opacity: 0;
  transform: scale(1.06);
  filter: blur(18px) saturate(80%);
}

.player-liquid-enter-from .expanded-panel {
  opacity: 0;
  transform: translateY(32px) scale(0.98);
}

.player-liquid-leave-to .expanded-panel {
  opacity: 0;
  transform: translateY(18px) scale(0.98);
}

.player-curtain-enter-active,
.player-curtain-leave-active {
  transition:
    clip-path 0.42s cubic-bezier(0.22, 1, 0.36, 1),
    opacity 0.28s ease;
}

.player-curtain-enter-active .expanded-panel,
.player-curtain-leave-active .expanded-panel {
  transition:
    opacity 0.3s ease,
    transform 0.38s cubic-bezier(0.22, 1, 0.36, 1);
}

.player-curtain-enter-from,
.player-curtain-leave-to {
  opacity: 0;
  clip-path: inset(100% 0 0 0 round 28px);
}

.player-curtain-enter-to,
.player-curtain-leave-from {
  clip-path: inset(0 0 0 0 round 0);
}

.player-curtain-enter-from .expanded-panel {
  opacity: 0;
  transform: translateY(24px);
}

.player-curtain-leave-to .expanded-panel {
  opacity: 0;
  transform: translateY(32px);
}

@media (prefers-reduced-motion: reduce) {
  .player-sheet-enter-active,
  .player-sheet-leave-active,
  .player-sheet-enter-active .expanded-panel,
  .player-sheet-leave-active .expanded-panel,
  .player-depth-enter-active,
  .player-depth-leave-active,
  .player-depth-enter-active .expanded-panel,
  .player-depth-leave-active .expanded-panel,
  .player-liquid-enter-active,
  .player-liquid-leave-active,
  .player-liquid-enter-active .expanded-panel,
  .player-liquid-leave-active .expanded-panel,
  .player-curtain-enter-active,
  .player-curtain-leave-active,
  .player-curtain-enter-active .expanded-panel,
  .player-curtain-leave-active .expanded-panel {
    transition: opacity 0.12s ease !important;
  }

  .player-sheet-enter-from,
  .player-sheet-leave-to,
  .player-sheet-enter-from .expanded-panel,
  .player-sheet-leave-to .expanded-panel,
  .player-depth-enter-from,
  .player-depth-leave-to,
  .player-depth-enter-from .expanded-panel,
  .player-depth-leave-to .expanded-panel,
  .player-liquid-enter-from,
  .player-liquid-leave-to,
  .player-liquid-enter-from .expanded-panel,
  .player-liquid-leave-to .expanded-panel,
  .player-curtain-enter-from,
  .player-curtain-leave-to,
  .player-curtain-enter-from .expanded-panel,
  .player-curtain-leave-to .expanded-panel {
    opacity: 0;
    transform: none !important;
    filter: none !important;
    clip-path: none !important;
  }
}

.soft-gradient-bg { position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; z-index: 0; }

/* ── 全屏封面 ── */
.fullscreen-cover {
  position: fixed;
  left: 0;
  top: 0;
  width: 60vw;
  height: 100vh;
  z-index: 0;
  background: center/cover no-repeat;
  mask-image: linear-gradient(to right, #000 80%, transparent 100%);
  -webkit-mask-image: linear-gradient(to right, #000 80%, transparent 100%);
  pointer-events: none;
  animation: anFadeUp 0.46s ease-out both;
  animation-delay: 0.1s;
}
.expanded-wrap.mode-fullscreen .panel-body {
  display: grid !important;
  grid-template-columns: 1fr !important;
}

/* ── 唱片模式（SPlayer 风格）── */
.vinyl-record {
  position: relative;
  width: min(52vh, 480px);
  aspect-ratio: 1 / 1;
}
/* 唱针 — 与 SPlayer 完全一致 */
.vinyl-pointer {
  position: absolute;
  width: 30%;
  left: 46%;
  top: -22%;
  z-index: 5;
  pointer-events: none;
}
.needle {
  display: block;
  width: 100%;
  height: auto;
  transform: rotate(-25deg);
  transform-origin: 10% 10%;
  backface-visibility: hidden;
  transition: transform 0.3s;
}
.vinyl-pointer.active .needle {
  transform: rotate(-8deg);
}
/* 唱片 */
.vinyl-disc {
  width: 100%;
  height: 100%;
  border-radius: 50%;
  /* 黑胶盘面纹理：多层交替同心圆 */
  background:
    radial-gradient(circle at center,
      #000 0%, #000 3%, #222 4%, #222 5%,
      #0a0a0a 6%, #1a1a1a 7%,
      #000 8.5%, #222 9.5%,
      #0a0a0a 10.5%, #1a1a1a 11.5%,
      #000 13%, #222 14%,
      #0a0a0a 15%, #1a1a1a 16%,
      #000 17.5%, #222 18.5%,
      #0a0a0a 19.5%, #1a1a1a 20.5%,
      #000 22%, #222 23%,
      #0a0a0a 24%, #1a1a1a 25%,
      #000 27%, #222 28%,
      #0a0a0a 29%, #1a1a1a 30%,
      #000 32%, #222 33%,
      #0a0a0a 34%, #1a1a1a 36%,
      #000 37.5%, #222 38.5%,
      #0a0a0a 40%, #1a1a1a 42%,
      #000 43.5%, #222 44.5%,
      #0a0a0a 46%, #1a1a1a 48%,
      #000 50%, #222 51%,
      #0a0a0a 53%, #1a1a1a 55%,
      #000 57%, #222 58%,
      #0a0a0a 60%, #1a1a1a 62%,
      #000 64%, #222 65.5%,
      #0a0a0a 67%, #1a1a1a 69%,
      #000 71%, #222 72.5%,
      #0a0a0a 74%, #1a1a1a 76%,
      #000 78%, #222 79%,
      #0a0a0a 81%, #111 100%
    );
  box-shadow:
    0 8px 32px rgba(0,0,0,0.6),
    inset 0 2px 4px rgba(255,255,255,0.05),
    inset 0 -1px 2px rgba(0,0,0,0.5);
  animation: playerCoverRotate 40s linear infinite;
  animation-play-state: paused;
  display: flex;
  align-items: center;
  justify-content: center;
}
.vinyl-disc.playing {
  animation-play-state: running;
}
/* 唱片内侧高光晕 */
.vinyl-disc::after {
  content: '';
  position: absolute;
  width: 64%;
  height: 64%;
  border-radius: 50%;
  background: radial-gradient(circle at 40% 40%,
    rgba(255,255,255,0.06) 0%,
    transparent 70%
  );
  pointer-events: none;
}
/* 内圈封面（专辑图） */
.record-cover {
  width: 64%;
  height: 64%;
  border-radius: 50%;
  background: #d9dee8 center/cover no-repeat;
  box-shadow:
    0 0 0 2px rgba(0,0,0,0.3),
    0 4px 16px rgba(0,0,0,0.5);
  position: relative;
  z-index: 1;
}

/* UI 自动显隐：隐藏时仅透明，保留布局占位 */
/* an-enter-card 的入场动画会与我们的 transition 冲突，禁用之 */
.panel-head,
.bottom-console {
  animation: none !important;
  transition: opacity 0.4s ease-in-out;
}
.right-actions {
  transition: opacity 0.4s ease-in-out;
}
.ui-hidden {
  opacity: 0 !important;
  pointer-events: none !important;
}
</style>
<style>
@property --hue1 { syntax: "<angle>"; inherits: false; initial-value: 0deg; }
@property --hue2 { syntax: "<angle>"; inherits: false; initial-value: 0deg; }
.soft-gradient-bg {
  background-image:
    linear-gradient(in oklch longer hue to right, oklch(0.95 0.07 var(--hue1) / 60%), oklch(0.92 0.08 var(--hue2) / 60%)),
    linear-gradient(in oklch longer hue to bottom, oklch(0.95 0.07 var(--hue1) / 60%), oklch(0.92 0.08 var(--hue2) / 60%));
  background-size: 100% 100%;
  animation-name: an-bg-hue;
  animation-duration: 7s;
  animation-timing-function: linear;
  animation-iteration-count: infinite;
}


/* 评论区浮层 */
.comments-overlay {
  grid-column: 1 / -1;
  align-self: stretch;
  min-height: 0;
  height: 100%;
  max-height: 100%;
  box-sizing: border-box;
  overflow-y: auto;
  scrollbar-width: none;
  background: color-mix(in srgb, var(--bg-app) 94%, transparent);
  backdrop-filter: blur(6px);
  display: flex;
  flex-direction: column;
  padding: var(--space-4);
  padding-bottom: 87px;

  /* Cascade palette-adaptive text colors to CommentPanel */
  --text-main: var(--overlay-text-main);
  --text-sub: var(--overlay-text-sub);
  --text-soft: var(--overlay-text-soft);
}

.comments-head {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  margin-bottom: var(--space-4);
  flex-shrink: 0;
}

.comments-head-cover {
  width: 80px;
  height: 80px;
  border-radius: 12px;
  overflow: hidden;
  flex-shrink: 0;
}

.comments-head-cover img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.comments-head-info {
  min-width: 0;
  display: grid;
  gap: 2px;
}

.comments-head-title {
  margin: 0;
  color: var(--text-main);
  font-size: var(--text-body-lg);
  font-weight: 700;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.comments-head-artist {
  margin: 0;
  color: var(--text-sub);
  font-size: 13px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.comments-head-album {
  margin: 0;
  color: var(--text-sub);
  font-size: 13px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.head-link {
  border: 0;
  background: transparent;
  color: var(--accent);
  cursor: pointer;
  padding: 0;
  font-size: inherit;
  font-family: inherit;
  white-space: nowrap;
}
.head-link:hover { opacity: 0.75; }
.head-link-static {
  color: var(--accent);
  font-size: inherit;
  font-family: inherit;
  white-space: nowrap;
}
.comments-head-time {
  margin: 0;
  color: var(--text-soft);
  font-size: 13px;
  line-height: 1.6;
}

/* 评论区滑入动画 */
/* 评论区切换动画 */
.panel-body.comments-mode .cover-hidden-head,
.panel-body.comments-mode .left-zone,
.panel-body.comments-mode .right-zone {
  display: none;
}

/* 评论区按钮高亮状态 */
.con-btn.active,
.ctrl.active {
  color: var(--accent);
}

/* 心动模式指示器 */
.intel-indicator {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--accent);
}
.intel-indicator svg,
.intel-icon svg {
  animation: an-spin 5s linear infinite;
}
</style>
