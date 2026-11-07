export type SpeechResultEvent = {
  resultIndex: number;
  results: {
    length: number;
    [key: number]: { isFinal: boolean; [key: number]: { transcript: string } };
  };
};
export interface Recognition {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((e: SpeechResultEvent) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
}
export function recognition(): Recognition | null {
  const w = window as unknown as {
    SpeechRecognition?: new () => Recognition;
    webkitSpeechRecognition?: new () => Recognition;
  };
  const C = w.SpeechRecognition || w.webkitSpeechRecognition;
  return C ? new C() : null;
}
export function speak(text: string) {
  if ("speechSynthesis" in window) {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 0.94;
    window.speechSynthesis.speak(utterance);
  }
}
