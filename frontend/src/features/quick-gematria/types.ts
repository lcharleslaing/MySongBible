export interface GematriaBreakdown {
  character: string;
  simple: number;
  english: number;
  jewish: number;
}

export interface GematriaResult {
  input: string;
  normalized: string;
  simple: number;
  english: number;
  jewish: number;
  breakdown: GematriaBreakdown[];
}

export interface QuickGematriaTranscription {
  text: string;
}

export interface QuickGematriaDesktopApi {
  calculate(input: string): Promise<GematriaResult>;
  transcribe(payload: {
    audioBytes: number[];
    mimeType: string;
  }): Promise<QuickGematriaTranscription>;
  hide(): Promise<{ ok: boolean }>;
  onOpened(callback: () => void): () => void;
}
