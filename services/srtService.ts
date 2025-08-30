
import type { SrtEntry } from '../types';

const timeToMs = (time: string): number => {
  const parts = time.split(/[:,]/);
  const hours = parseInt(parts[0], 10);
  const minutes = parseInt(parts[1], 10);
  const seconds = parseInt(parts[2], 10);
  const milliseconds = parseInt(parts[3], 10);
  return hours * 3600000 + minutes * 60000 + seconds * 1000 + milliseconds;
};

const msToTime = (ms: number): string => {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = String(Math.floor(totalSeconds / 3600)).padStart(2, '0');
  const minutes = String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, '0');
  const seconds = String(totalSeconds % 60).padStart(2, '0');
  const milliseconds = String(ms % 1000).padStart(3, '0');
  return `${hours}:${minutes}:${seconds},${milliseconds}`;
};

export const parseSrt = (srtContent: string): SrtEntry[] => {
  const entries: SrtEntry[] = [];
  // Normalize line endings and split into blocks
  const blocks = srtContent.replace(/\r\n/g, '\n').trim().split(/\n\s*\n/);

  for (const block of blocks) {
    const lines = block.trim().split('\n');
    if (lines.length >= 2) {
      const id = parseInt(lines[0], 10);
      const timeMatch = lines[1].match(/(\d{2}:\d{2}:\d{2},\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2},\d{3})/);
      
      if (!isNaN(id) && timeMatch) {
        const startTime = timeToMs(timeMatch[1]);
        const endTime = timeToMs(timeMatch[2]);
        const text = lines.slice(2).join('\n');
        entries.push({ id, startTime, endTime, text });
      }
    }
  }
  return entries;
};

export const stringifySrt = (entries: SrtEntry[]): string => {
  return entries
    .map(entry => `${entry.id}\n${msToTime(entry.startTime)} --> ${msToTime(entry.endTime)}\n${entry.text}`)
    .join('\n\n');
};
