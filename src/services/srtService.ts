export interface SrtEntry {
  id: string;
  startTime: string;
  endTime: string;
  text: string;
}

export function parseSrt(srtContent: string): SrtEntry[] {
  const entries: SrtEntry[] = [];
  const lines = srtContent.trim().split(/\r?\n/);
  let currentEntry: Partial<SrtEntry> = {};
  let textLines: string[] = [];

  for (const line of lines) {
    if (!currentEntry.id) {
      if (/^\d+$/.test(line)) {
        currentEntry.id = line;
      }
    } else if (!currentEntry.startTime) {
      const match = line.match(/(\d{2}:\d{2}:\d{2},\d{3}) --> (\d{2}:\d{2}:\d{2},\d{3})/);
      if (match) {
        currentEntry.startTime = match[1];
        currentEntry.endTime = match[2];
      } else {
        // Invalid time format, reset
        currentEntry = {};
      }
    } else if (line.trim() !== '') {
      textLines.push(line.trim());
    } else {
      // End of an entry (blank line)
      currentEntry.text = textLines.join('\n');
      entries.push(currentEntry as SrtEntry);
      
      // Reset for next entry
      currentEntry = {};
      textLines = [];
    }
  }

  // Add the last entry if the file doesn't end with a blank line
  if (currentEntry.id && currentEntry.startTime) {
    currentEntry.text = textLines.join('\n');
    entries.push(currentEntry as SrtEntry);
  }
  
  if (entries.length === 0 && srtContent.trim().length > 0) {
    throw new Error("Invalid SRT format. No entries could be parsed.");
  }

  return entries;
}