import React, { useState, useCallback, useRef } from 'react';
import { geminiProcessSrt } from './services/geminiService';
import { parseSrt, SrtEntry } from './services/srtService';
import { DownloadIcon, FileIcon, LoaderIcon, ResetIcon, UploadIcon } from './components/Icons';

type Status = 'idle' | 'loading' | 'success' | 'error';

function App() {
  const [status, setStatus] = useState<Status>('idle');
  const [fileName, setFileName] = useState('');
  const [originalSrt, setOriginalSrt] = useState<SrtEntry[]>([]);
  const [processedSrt, setProcessedSrt] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      if (file.name.toLowerCase().endsWith('.srt')) {
        const reader = new FileReader();
        reader.onload = async (e) => {
          const content = e.target?.result as string;
          try {
            const parsedSrt = parseSrt(content);
            setFileName(file.name);
            setOriginalSrt(parsedSrt);
            setStatus('loading');
            setErrorMessage('');
            const result = await geminiProcessSrt(parsedSrt);
            setProcessedSrt(result);
            setStatus('success');
          } catch (error) {
            console.error(error);
            const message = error instanceof Error ? error.message : 'An unknown error occurred.';
            setErrorMessage(`Failed to process SRT file: ${message}`);
            setStatus('error');
          }
        };
        reader.onerror = () => {
          setErrorMessage('Failed to read the file.');
          setStatus('error');
        };
        reader.readAsText(file);
      } else {
        setErrorMessage('Please upload a valid .srt file.');
        setStatus('error');
      }
    }
  }, []);

  const handleReset = () => {
    setStatus('idle');
    setFileName('');
    setOriginalSrt([]);
    setProcessedSrt('');
    setErrorMessage('');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleDownload = () => {
    const blob = new Blob([processedSrt], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    const newFileName = fileName.replace('.srt', '_processed.srt');
    link.download = newFileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const triggerFileUpload = () => {
    fileInputRef.current?.click();
  };

  return (
    <div className="bg-gray-900 text-white min-h-screen flex flex-col items-center justify-center p-4 font-sans">
      <div className="w-full max-w-2xl mx-auto">
        <header className="text-center mb-8">
          <h1 className="text-4xl font-bold mb-2 bg-gradient-to-r from-purple-400 to-indigo-500 text-transparent bg-clip-text">AI Shorts Subtitle Splitter</h1>
          <p className="text-gray-400">Gemini API를 사용하여 YouTube Shorts 자막을 최적화하세요.</p>
        </header>

        <main className="bg-gray-800 rounded-lg shadow-2xl p-8">
          {status === 'idle' && (
            <div
              className="border-2 border-dashed border-gray-600 rounded-lg p-12 text-center cursor-pointer hover:border-purple-400 hover:bg-gray-700 transition-colors"
              onClick={triggerFileUpload}
            >
              <UploadIcon className="mx-auto mb-4" />
              <h2 className="text-xl font-semibold mb-2">.srt 파일을 여기에 드롭하거나 클릭하여 업로드하세요.</h2>
              <p className="text-gray-500">파일이 처리된 후 최적화된 버전을 다운로드할 수 있습니다.</p>
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileChange}
                accept=".srt"
                className="hidden"
                aria-label="Upload SRT file"
              />
            </div>
          )}

          {(status === 'loading' || status === 'success' || status === 'error') && (
            <div>
              <div className="flex items-center justify-between mb-6 bg-gray-700 p-3 rounded-lg">
                <div className="flex items-center space-x-3">
                  <FileIcon />
                  <span className="font-mono">{fileName}</span>
                </div>
                <button onClick={handleReset} className="text-gray-400 hover:text-white transition-colors" aria-label="Reset">
                  <ResetIcon />
                </button>
              </div>

              {status === 'loading' && (
                <div className="text-center">
                  <LoaderIcon className="mx-auto animate-spin mb-4" />
                  <p className="text-lg">AI가 자막을 최적화하는 중입니다...</p>
                  <p className="text-gray-400">잠시만 기다려주세요. 이 작업은 몇 초 정도 걸릴 수 있습니다.</p>
                </div>
              )}

              {status === 'error' && (
                <div className="bg-red-900/50 border border-red-500 text-red-300 px-4 py-3 rounded-lg text-center">
                  <p className="font-bold">Error</p>
                  <p>{errorMessage}</p>
                </div>
              )}

              {status === 'success' && (
                <div>
                  <h3 className="text-2xl font-semibold mb-4 text-center text-green-400">자막 최적화 완료!</h3>
                  <div className="bg-gray-900 rounded-lg p-4 max-h-60 overflow-y-auto mb-6 font-mono text-sm">
                    <pre>{processedSrt}</pre>
                  </div>
                  <button
                    onClick={handleDownload}
                    className="w-full bg-purple-600 hover:bg-purple-700 text-white font-bold py-3 px-4 rounded-lg flex items-center justify-center space-x-2 transition-transform transform hover:scale-105"
                  >
                    <DownloadIcon />
                    <span>최적화된 파일 다운로드</span>
                  </button>
                </div>
              )}
            </div>
          )}
        </main>

        <footer className="text-center mt-8 text-gray-500 text-sm">
          <p>&copy; {new Date().getFullYear()} AI Shorts Subtitle Splitter. Powered by Gemini.</p>
        </footer>
      </div>
    </div>
  );
}

export default App;