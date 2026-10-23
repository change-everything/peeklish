export function canSpeak(): boolean {
  return typeof speechSynthesis !== 'undefined' && typeof SpeechSynthesisUtterance !== 'undefined';
}

export function speakEnglish(text: string): void {
  if (!canSpeak()) return;
  const spoken = text.trim().slice(0, 400);
  if (!spoken) return;
  speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(spoken);
  utterance.lang = 'en-US';
  utterance.rate = 0.95;
  speechSynthesis.speak(utterance);
}
