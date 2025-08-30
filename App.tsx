
import React, { useState, useCallback, useRef, useEffect } from 'react';
import { processSubtitlesBatch } from './services/geminiService';
import { parseSrt, stringifySrt } from './services/srtService';
import type { SrtEntry } from './types';
import { LoadingSpinner, SparklesIcon, UploadIcon, DownloadIcon, MagicIcon, ErrorIcon } from './components/Icons';

const App: React.FC = () => {
  const [originalSrt, setOriginalSrt] = useState<string>('');
  const [processedSrt, setProcessedSrt] = useState<string>('');
  const [fileName, setFileName] = useState<string>('processed.srt');
  const [maxChars, setMaxChars] = useState<number>(15);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [processingStatus, setProcessingStatus] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // State for timer and progress
  const startTimeRef = useRef<number | null>(null);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [progress, setProgress] = useState(0);
  const [processingTime, setProcessingTime] = useState<number | null>(null);

  useEffect(() => {
    let timerInterval: ReturnType<typeof setInterval> | null = null;
    let progressInterval: ReturnType<typeof setInterval> | null = null;

    if (isLoading) {
        const start = startTimeRef.current || Date.now();

        // Timer for elapsed seconds
        timerInterval = setInterval(() => {
            setElapsedTime(Math.floor((Date.now() - start) / 1000));
        }, 1000);

        // Simulated progress
        setProgress(0);
        const estimatedDuration = 30000; // 30 seconds for 95%

        progressInterval = setInterval(() => {
            const timePassed = Date.now() - start;
            // Slowly approach 95% over the estimated duration
            const calculatedProgress = (timePassed / estimatedDuration) * 95;
            setProgress(Math.min(95, calculatedProgress));
        }, 250);
    }

    return () => {
        if (timerInterval) clearInterval(timerInterval);
        if (progressInterval) clearInterval(progressInterval);
    };
  }, [isLoading]);

  const handleNewUpload = () => {
    setOriginalSrt('');
    setProcessedSrt('');
    setFileName('processed.srt');
    setError(null);
    setProcessingStatus('');
    setProcessingTime(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };
  
  const handleFileChange = (file: File | null) => {
    if (file) {
      if (!file.name.toLowerCase().endsWith('.srt')) {
        setError('유효한 .srt 파일만 업로드할 수 있습니다.');
        return;
      }
      const reader = new FileReader();
      reader.onload = (e) => {
        setOriginalSrt(e.target?.result as string);
        setProcessedSrt('');
        setError(null);
        setProcessingTime(null);
        setFileName(file.name.replace('.srt', '_processed.srt'));
      };
      reader.readAsText(file);
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileChange(e.dataTransfer.files[0]);
    }
  };

  const handleTransform = useCallback(async () => {
    if (!originalSrt) {
      setError('먼저 SRT 파일을 업로드하세요.');
      return;
    }

    setProcessingTime(null);
    startTimeRef.current = Date.now();
    setElapsedTime(0);
    setProgress(0);
    setIsLoading(true);
    setError(null);
    setProcessedSrt('');
    setProcessingStatus('AI가 전체 자막을 분석하고 있습니다...');

    try {
      const originalEntries = parseSrt(originalSrt);
      const processedEntriesFromAI = await processSubtitlesBatch(originalEntries, maxChars);
      
      const originalEntriesMap = new Map<number, SrtEntry>(originalEntries.map(e => [e.id, e]));
      const newSrtEntries: SrtEntry[] = [];
      let newId = 1;

      for (const processedEntry of processedEntriesFromAI) {
        if (processedEntry?.id == null) {
          console.warn("Processed entry is missing an ID. Skipping.", processedEntry);
          continue;
        }
        
        const originalEntry = originalEntriesMap.get(processedEntry.id);
        if (!originalEntry) {
          console.warn(`Could not find original entry for processed ID: ${processedEntry.id}. Skipping.`);
          continue;
        }

        if (Array.isArray(processedEntry.text)) {
            const textChunks = processedEntry.text.filter(c => typeof c === 'string' && c.trim().length > 0);

            if (textChunks.length < 2) {
                const combinedText = textChunks.join(' ') || originalEntry.text;
                newSrtEntries.push({ id: newId++, startTime: originalEntry.startTime, endTime: originalEntry.endTime, text: combinedText });
                continue;
            }

            const totalDuration = originalEntry.endTime - originalEntry.startTime;
            const totalLength = textChunks.reduce((acc, chunk) => acc + chunk.replace(/\n/g, '').length, 0);
            let currentStartTime = originalEntry.startTime;

            if (totalLength > 0 && totalDuration > 0) {
                for (let i = 0; i < textChunks.length; i++) {
                    const chunk = textChunks[i];
                    const chunkLength = chunk.replace(/\n/g, '').length;
                    
                    if (i === textChunks.length - 1) {
                        newSrtEntries.push({ id: newId++, startTime: currentStartTime, endTime: originalEntry.endTime, text: chunk });
                    } else {
                        const chunkDuration = Math.round(totalDuration * (chunkLength / totalLength));
                        const newEndTime = currentStartTime + chunkDuration;
                        newSrtEntries.push({ id: newId++, startTime: currentStartTime, endTime: newEndTime, text: chunk });
                        currentStartTime = newEndTime;
                    }
                }
            } else {
                 const chunkDuration = Math.floor(totalDuration / textChunks.length) || 0;
                 let startTime = originalEntry.startTime;
                 for(let i = 0; i < textChunks.length; i++) {
                     const chunk = textChunks[i];
                     const endTime = (i === textChunks.length - 1) ? originalEntry.endTime : startTime + chunkDuration;
                     newSrtEntries.push({ id: newId++, startTime: startTime, endTime: endTime, text: chunk });
                     startTime = endTime;
                 }
            }
        } else if (typeof processedEntry.text === 'string') {
            newSrtEntries.push({ id: newId++, startTime: originalEntry.startTime, endTime: originalEntry.endTime, text: processedEntry.text });
        } else {
             console.warn(`Processed entry ID ${processedEntry.id} has invalid text format. Using original.`, processedEntry.text);
             newSrtEntries.push({ ...originalEntry, id: newId++ });
        }
      }

      setProcessedSrt(stringifySrt(newSrtEntries));
    } catch (err) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('자막 변환 중 알 수 없는 오류가 발생했습니다.');
      }
    } finally {
      if (startTimeRef.current) {
        const endTime = Date.now();
        setProcessingTime((endTime - startTimeRef.current) / 1000);
        startTimeRef.current = null;
      }
      setIsLoading(false);
      setProcessingStatus('');
    }
  }, [originalSrt, maxChars]);

  const handleDownload = () => {
    if (!processedSrt) return;
    const blob = new Blob([processedSrt], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const renderContent = () => {
    if (!originalSrt) {
      return (
        <div
          onDragEnter={(e) => { e.preventDefault(); e.stopPropagation(); setIsDragOver(true); }}
          onDragLeave={(e) => { e.preventDefault(); e.stopPropagation(); setIsDragOver(false); }}
          onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`mt-6 border-2 border-dashed rounded-2xl p-12 text-center cursor-pointer transition-colors duration-300 ${isDragOver ? 'border-blue-500 bg-blue-900/20' : 'border-gray-600 hover:border-blue-600 hover:bg-gray-800/50'}`}
        >
          <UploadIcon className="w-16 h-16 mx-auto text-gray-500 mb-4" />
          <p className="text-gray-300 font-semibold">여기에 .srt 파일을 드래그 앤 드롭하세요.</p>
          <p className="text-gray-500 mt-2">또는 클릭하여 파일을 선택하세요.</p>
          <input
            type="file"
            ref={fileInputRef}
            onChange={(e) => handleFileChange(e.target.files ? e.target.files[0] : null)}
            className="hidden"
            accept=".srt"
          />
        </div>
      );
    }

    return (
      <>
        <div className="bg-gray-900/50 rounded-lg p-4 my-6 border border-gray-700">
            <div className="flex flex-col md:flex-row items-center justify-between gap-4">
              <div className="flex flex-col sm:flex-row items-center gap-4 w-full md:w-auto">
                <div className="flex items-center gap-3">
                  <label htmlFor="max-chars" className="text-gray-300 font-medium whitespace-nowrap">한 줄 최대 글자 수:</label>
                  <input
                    id="max-chars"
                    type="number"
                    value={maxChars}
                    onChange={(e) => setMaxChars(parseInt(e.target.value, 10) || 1)}
                    className="bg-gray-900 border border-gray-600 rounded-md px-3 py-1 w-20 text-center focus:ring-2 focus:ring-blue-500 focus:outline-none"
                    min="1"
                  />
                </div>
              </div>
              <div className="flex gap-3 w-full md:w-auto">
                <button
                  onClick={handleTransform}
                  disabled={isLoading}
                  className="w-full flex-1 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-900/50 disabled:text-gray-400 disabled:cursor-not-allowed text-white font-bold py-2 px-4 rounded-lg transition-all duration-300 ease-in-out focus:outline-none focus:ring-4 focus:ring-blue-500/50 flex items-center justify-center gap-2 shadow-lg hover:shadow-blue-500/40"
                >
                  <MagicIcon className="w-5 h-5"/>
                  <span>변환하기</span>
                </button>
                <button
                  onClick={handleDownload}
                  disabled={!processedSrt || isLoading}
                  className="w-full flex-1 bg-green-600 hover:bg-green-700 disabled:bg-green-900/50 disabled:text-gray-400 disabled:cursor-not-allowed text-white font-bold py-2 px-4 rounded-lg transition-all duration-300 ease-in-out focus:outline-none focus:ring-4 focus:ring-green-500/50 flex items-center justify-center gap-2 shadow-lg hover:shadow-green-500/40"
                >
                  <DownloadIcon className="w-5 h-5"/>
                  <span>저장하기</span>
                </button>
              </div>
            </div>
            {(processingTime !== null || originalSrt) && (
              <div className="mt-4 pt-4 border-t border-gray-700 space-y-3">
                {processingTime !== null && (
                  <p className="text-green-400 font-medium text-center">
                    ✨ 변환 완료! (총 {processingTime.toFixed(1)}초 소요)
                  </p>
                )}
                {originalSrt && (
                  <button
                      onClick={handleNewUpload}
                      className="w-full bg-gray-600 hover:bg-gray-700 text-white font-bold py-2 px-4 rounded-lg transition-colors duration-300 ease-in-out focus:outline-none focus:ring-4 focus:ring-gray-500/50 flex items-center justify-center gap-2"
                  >
                      <UploadIcon className="w-5 h-5" />
                      <span>새 파일 업로드</span>
                  </button>
                )}
              </div>
            )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <h3 className="text-lg font-semibold text-gray-400 mb-2">원본 SRT</h3>
            <textarea
              readOnly
              value={originalSrt}
              className="w-full h-96 bg-black/30 border border-gray-700 rounded-lg p-4 text-gray-300 font-mono text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-600"
              aria-label="Original SRT content"
            />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-gray-400 mb-2">결과 SRT (수정 가능)</h3>
            <textarea
              value={isLoading ? '' : processedSrt}
              onChange={(e) => setProcessedSrt(e.target.value)}
              className={`w-full h-96 bg-black/30 border border-gray-700 rounded-lg p-4 text-gray-300 font-mono text-sm resize-none focus:outline-none focus:ring-2 ${isLoading ? 'focus:ring-gray-600' : 'focus:ring-green-600'}`}
              placeholder={isLoading ? 'AI가 변환 중입니다...' : '변환 결과가 여기에 표시됩니다.'}
              disabled={isLoading}
              aria-label="Processed SRT content"
            />
          </div>
        </div>
      </>
    );
  };

  return (
    <div className="min-h-screen bg-gray-900 text-white p-4 sm:p-6 lg:p-8 flex flex-col items-center">
      <div className="w-full max-w-7xl relative">
          {isLoading && (
            <div className="absolute inset-0 bg-gray-900/80 backdrop-blur-sm flex flex-col items-center justify-center z-10 rounded-2xl p-8 text-center" role="status" aria-live="polite">
              <LoadingSpinner className="w-16 h-16" />
              <p className="mt-6 text-lg font-semibold">{processingStatus}</p>
              <div className="w-full max-w-sm bg-gray-700 rounded-full h-2.5 my-4" aria-label="Processing progress">
                  <div className="bg-blue-500 h-2.5 rounded-full transition-all duration-300 ease-linear" style={{ width: `${progress.toFixed(2)}%` }}></div>
              </div>
              <p className="text-gray-400">{Math.floor(progress)}% • {elapsedTime}초 경과</p>
            </div>
          )}
          <div className="flex justify-between items-center mb-4">
              <div className="flex items-center gap-3">
                  <SparklesIcon className="w-8 h-8 text-blue-400" />
                  <h1 className="text-3xl font-bold">AI 쇼츠 자막 분할기</h1>
              </div>
          </div>
          
          {error && (
            <div className="bg-red-900/50 border border-red-700 text-red-300 px-4 py-3 rounded-lg relative mb-6 flex items-start gap-3" role="alert">
              <ErrorIcon className="w-6 h-6 mt-1 flex-shrink-0"/>
              <div>
                <strong className="font-bold">오류가 발생했습니다:</strong>
                <span className="block sm:inline ml-2">{error}</span>
              </div>
            </div>
          )}
          {renderContent()}
      </div>
    </div>
  );
};

export default App;
