export class LocalMusicDB {
  constructor(dbPath: string)

  // Lifecycle
  init(): Promise<void>
  close(): Promise<void>

  // Track CRUD
  getTrack(id: number | string): Promise<any>
  getTrackByPath(filePath: string): Promise<any>
  getAllTracks(): Promise<any[]>
  searchTracks(query: string): Promise<any[]>
  getTrackCount(): Promise<number>
  addTrack(track: any): Promise<number>
  updateTrack(id: number | string, track: any): Promise<void>
  deleteTrack(id: number | string): Promise<void>
  upsertTracks(tracks: any[]): Promise<void>
  removeTracks(paths: string[]): Promise<void>
  clearAllTracks(): Promise<void>
  removeTracksByDirectory(dirPath: string): Promise<void>

  // Track metadata
  getAllMtimes(): Promise<Map<string, number>>
  getRecentTracks(limit?: number): Promise<any[]>
  getTrackStats(): Promise<{ totalTracks: number; totalArtists: number; totalAlbums: number; totalDuration: number; totalSize: number }>

  // Playlist CRUD
  createPlaylist(name: string, description?: string): Promise<number>
  listPlaylists(): Promise<any[]>
  getPlaylist(id: number | string): Promise<any>
  deletePlaylist(id: number | string): Promise<void>
  renamePlaylist(id: number | string, name: string): Promise<void>
  updatePlaylist(id: number | string, updates: { name?: string; description?: string; customCoverUrl?: string }): Promise<void>

  // Playlist-Track relations
  addTrackToPlaylist(playlistId: number | string, trackId: number | string): Promise<void>
  removeTrackFromPlaylist(playlistId: number | string, trackId: number | string): Promise<void>
  getPlaylistTracks(playlistId: number | string): Promise<any[]>

  // Cover
  getAllPlaylistCoverPaths(): Promise<Record<string, string[]>>
}