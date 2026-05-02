import React from 'react';
import { X, ExternalLink, FileText, Download } from 'lucide-react';
import { Document } from '../types';
import { formatBytes } from '../lib/utils';

interface FilePreviewProps {
  document: Document;
  onClose: () => void;
}

export default function FilePreview({ document, onClose }: FilePreviewProps) {
  const getFileIcon = (type: string | undefined) => {
    if (!type) return <FileText className="text-zinc-400" />;
    if (type.includes('pdf')) return <FileText className="text-red-500" />;
    if (type.includes('image')) return <FileText className="text-blue-500" />;
    return <FileText className="text-zinc-400" />;
  };

  const fileUrl = document.download_url;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/90 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-5xl h-full max-h-[90vh] bg-zinc-900 rounded-2xl overflow-hidden flex flex-col border border-zinc-800 shadow-2xl">
        <div className="p-4 border-b border-zinc-800 flex items-center justify-between bg-zinc-900/50 backdrop-blur-md">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-zinc-800 rounded-lg">
              {getFileIcon(document.file_type)}
            </div>
            <div>
              <h3 className="text-sm font-bold text-white truncate max-w-md">{document.name}</h3>
              <p className="text-[10px] text-zinc-500 uppercase tracking-widest">{formatBytes(document.size)}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button 
              onClick={() => window.open(fileUrl, '_blank')}
              className="p-2 text-zinc-400 hover:text-white transition-colors"
              title="Open in new tab"
            >
              <ExternalLink size={20} />
            </button>
            <button 
              onClick={onClose}
              className="p-2 text-zinc-400 hover:text-white transition-colors"
            >
              <X size={24} />
            </button>
          </div>
        </div>
        <div className="flex-1 bg-zinc-950 flex items-center justify-center overflow-auto p-4">
          {!fileUrl ? (
            <div className="text-center text-zinc-500">
              <Loader2 className="animate-spin mb-2 mx-auto" />
              <p>Loading preview...</p>
            </div>
          ) : document.file_type?.includes('image') ? (
            <img 
              src={fileUrl} 
              alt={document.name}
              className="max-w-full max-h-full object-contain rounded-lg shadow-2xl"
              referrerPolicy="no-referrer"
            />
          ) : document.file_type?.includes('pdf') ? (
            <iframe 
              src={`${fileUrl}#toolbar=0`}
              className="w-full h-full rounded-lg border-none"
              title={document.name}
            />
          ) : (
            <div className="text-center space-y-4">
              <div className="w-20 h-20 bg-zinc-900 rounded-3xl flex items-center justify-center mx-auto text-zinc-700">
                <FileText size={40} />
              </div>
              <div className="space-y-2">
                <p className="text-zinc-400 font-medium">Preview not available for this file type</p>
                <button 
                  onClick={() => window.open(fileUrl, '_blank')}
                  className="text-emerald-500 hover:text-emerald-400 font-bold text-sm flex items-center gap-2 mx-auto"
                >
                  <Download size={16} /> Download to view
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

import { Loader2 } from 'lucide-react';

