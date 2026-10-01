import React, { useEffect, useState } from 'react';
import { Copy, Check, Download, FileCode, Database, Terminal, BookOpen } from 'lucide-react';

interface SourceFile {
  path: string;
  title: string;
  lang: string;
  content: string;
}

export default function PhpSourceViewer() {
  const [files, setFiles] = useState<SourceFile[]>([]);
  const [selectedPath, setSelectedPath] = useState<string>('database/migrations/002_network_inventory.sql');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    fetch('/api/v1/php-source')
      .then((r) => r.json())
      .then((data) => {
        if (data.files && data.files.length > 0) {
          setFiles(data.files);
          setSelectedPath(data.files[0].path);
        }
      })
      .catch(() => {});
  }, []);

  const currentFile = files.find((f) => f.path === selectedPath) || files[0];

  const handleCopy = () => {
    if (!currentFile) return;
    navigator.clipboard.writeText(currentFile.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = (f: SourceFile) => {
    const blob = new Blob([f.content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = f.path.split('/').pop() || 'file.php';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-slate-800 pb-5">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-100">
            Código Fuente PHP 8.2+ & MySQL 8+ (Arquitectura MVC + PDO + Leaflet)
          </h1>
          <p className="mt-1 text-sm text-slate-400">
            Archivos listos para despliegue en VPS Linux con Apache/Nginx, incluyendo el módulo de Inventario de Red, Esquema MySQL 8, Driver MikroTik RouterOS y CLI CRON.
          </p>
        </div>
        {currentFile && (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleCopy}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-900 px-3.5 py-2 text-xs font-medium text-slate-200 hover:bg-slate-800 transition-colors whitespace-nowrap"
            >
              {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
              {copied ? 'Copiado al portapapeles' : 'Copiar Archivo'}
            </button>
            <button
              type="button"
              onClick={() => handleDownload(currentFile)}
              className="inline-flex items-center gap-2 rounded-lg bg-sky-500 px-4 py-2 text-xs font-semibold text-slate-950 hover:bg-sky-400 transition-colors whitespace-nowrap"
            >
              <Download className="h-3.5 w-3.5" />
              Descargar {currentFile.path.split('/').pop()}
            </button>
          </div>
        )}
      </div>

      {/* Architectural Overview Matrix */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-4">
          <div className="flex items-center gap-2 text-xs font-semibold text-sky-400">
            <Database className="h-4 w-4" />
            1. Base de Datos MySQL 8+
          </div>
          <p className="mt-1.5 text-xs text-slate-400 leading-relaxed">
            35+ tablas normalizadas (`InnoDB`, `utf8mb4`), claves foráneas, índices compuestos, `DECIMAL(12,2)` y migración `002_network_inventory.sql`.
          </p>
        </div>

        <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-4">
          <div className="flex items-center gap-2 text-xs font-semibold text-emerald-400">
            <FileCode className="h-4 w-4" />
            2. Modelo & Controlador PDO
          </div>
          <p className="mt-1.5 text-xs text-slate-400 leading-relaxed">
            `NetworkDevice.php` y `NetworkInventoryController.php` con Prepared Statements, validación de MAC/IP/GPS, protección CSRF y aislamiento Multi-ISP.
          </p>
        </div>

        <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-4">
          <div className="flex items-center gap-2 text-xs font-semibold text-purple-400">
            <Terminal className="h-4 w-4" />
            3. Drivers Reales & CLI CRON
          </div>
          <p className="mt-1.5 text-xs text-slate-400 leading-relaxed">
            `RouterOSApiDriver.php` (socket binario 8728/8729), `OLTDriverInterface`, `WhatsAppProviderInterface` y script CLI `artisan`.
          </p>
        </div>

        <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-4">
          <div className="flex items-center gap-2 text-xs font-semibold text-amber-400">
            <BookOpen className="h-4 w-4" />
            4. Vista Bootstrap 5 + Leaflet
          </div>
          <p className="mt-1.5 text-xs text-slate-400 leading-relaxed">
            `resources/views/network/inventory.php` con mapa OpenStreetMap integrado, marcadores interactivos y filtros dinámicos `fetch()`.
          </p>
        </div>
      </div>

      {/* File Explorer + Code View */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        <div className="lg:col-span-4 space-y-1.5 rounded-lg border border-slate-800 bg-slate-900/70 p-3">
          <div className="px-2 py-1.5 text-[11px] font-semibold text-slate-400">
            Archivos del Proyecto PHP 8.2 / MySQL 8
          </div>
          {files.map((file) => {
            const active = file.path === selectedPath;
            return (
              <button
                key={file.path}
                type="button"
                onClick={() => setSelectedPath(file.path)}
                className={`w-full text-left rounded-lg px-3 py-2.5 text-xs transition-colors ${
                  active
                    ? 'bg-sky-500/15 text-sky-300 border border-sky-500/40'
                    : 'text-slate-300 hover:bg-slate-800/60 border border-transparent'
                }`}
              >
                <div className="font-mono font-semibold truncate">{file.path}</div>
                <div className="text-[11px] text-slate-400 truncate mt-0.5">{file.title}</div>
              </button>
            );
          })}
        </div>

        <div className="lg:col-span-8 rounded-lg border border-slate-800 bg-slate-950 overflow-hidden flex flex-col">
          {currentFile && (
            <>
              <div className="flex items-center justify-between border-b border-slate-800 bg-slate-900/80 px-4 py-2.5">
                <span className="font-mono text-xs text-sky-400">{currentFile.path}</span>
                <span className="font-mono text-[11px] text-slate-400">
                  {currentFile.content.split('\n').length} líneas
                </span>
              </div>
              <pre className="p-4 text-xs font-mono text-slate-200 overflow-x-auto max-h-[620px] leading-relaxed">
                <code>{currentFile.content}</code>
              </pre>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
