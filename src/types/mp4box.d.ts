declare module 'mp4box' {
  export interface MP4MediaTrack {
    id: number;
    created: Date;
    modified: Date;
    movie_duration: number;
    layer: number;
    alternate_group: number;
    volume: number;
    track_width: number;
    track_height: number;
    timescale: number;
    duration: number;
    bitrate: number;
    codec: string;
    video?: {
      width: number;
      height: number;
    };
    audio?: {
      channel_count: number;
      sample_rate: number;
      sample_size: number;
    };
  }

  export interface MP4Info {
    duration: number;
    timescale: number;
    isFragmented: boolean;
    isProgressive: boolean;
    hasMoov: boolean;
    tracks: MP4MediaTrack[];
    videoTracks: MP4MediaTrack[];
    audioTracks: MP4MediaTrack[];
  }

  export interface MP4Sample {
    number: number;
    track_id: number;
    description: any;
    is_sync: boolean;
    dts: number;
    cts: number;
    duration: number;
    timescale: number;
    size: number;
    data: Uint8Array;
  }

  export interface MP4File {
    onReady?: (info: MP4Info) => void;
    onError?: (error: any) => void;
    onSamples?: (id: number, user: any, samples: MP4Sample[]) => void;
    appendBuffer(data: ArrayBuffer & { fileStart: number }): number;
    flush(): void;
    start(): void;
    stop(): void;
    setExtractionOptions(id: number, user?: any, options?: { nbSamples?: number; rapAlignment?: boolean }): void;
    releaseUsedSamples(id: number, sampleNumber: number): void;
  }

  export function createFile(): MP4File;
}
