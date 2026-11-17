'use client';

import { useState } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import { createWorker } from 'tesseract.js';

pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;

async function extrairTextoComOCR(
  file: File,
  onProgress: (msg: string) => void
): Promise<string> {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const totalPaginas = Math.min(pdf.numPages, 12);

  onProgress('Iniciando leitura óptica (OCR)...');
  const worker = await createWorker('por');
  let textoCompleto = '';

  for (let i = 1; i <= totalPaginas; i++) {
    onProgress(`Lendo página ${i} de ${totalPaginas}...`);
    const page = await pdf.getPage(i);
    const viewport = page.getViewport({ scale: 2.5 });

    // 1. Renderiza a página completa em um canvas temporário
    const fullCanvas = document.createElement('canvas');
    const fullContext = fullCanvas.getContext('2d');
    if (!fullContext) continue;

    fullCanvas.width = viewport.width;
    fullCanvas.height = viewport.height;

    await page.render({
      canvas: fullCanvas,
      canvasContext: fullContext,
      viewport,
    }).promise;

    // 2. Recorta apenas a área útil das questões (remove os 26% da direita onde fica o menu lateral)
    // e corta 5% do topo/rodapé (onde fica URL e data/hora da impressão)
    const cropX = 0;
    const cropY = Math.floor(viewport.height * 0.05);
    const cropWidth = Math.floor(viewport.width * 0.74);
    const cropHeight = Math.floor(viewport.height * 0.90);

    const croppedCanvas = document.createElement('canvas');
    const croppedContext = croppedCanvas.getContext('2d');
    if (!croppedContext) continue;

    croppedCanvas.width = cropWidth;
    croppedCanvas.height = cropHeight;

    // Fundo branco garante contraste máximo para o Tesseract
    croppedContext.fillStyle = '#FFFFFF';
    croppedContext.fillRect(0, 0, cropWidth, cropHeight);
    croppedContext.drawImage(
      fullCanvas,
      cropX,
      cropY,
      cropWidth,
      cropHeight,
      0,
      0,
      cropWidth,
      cropHeight
    );

    const { data } = await worker.recognize(croppedCanvas);

    // Limpa ruídos residuais dos botões da plataforma antes de mandar para a IA
    const textoLimpo = data.text
      .replace(/Marcar para revisão/gi, '')
      .replace(/Acess[íi]vel com Libras/gi, '')
      .replace(/VLibras/gi, '')
      .replace(/Acessivel\.com/gi, '');

    textoCompleto += `--- Página ${i} ---\n${textoLimpo}\n\n`;
  }

  await worker.terminate();
  return textoCompleto;
}

export default function Home() {
  const [resultado, setResultado] = useState('');
  const [modeloUsado, setModeloUsado] = useState('');
  const [status, setStatus] = useState('');
  const [erro, setErro] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setLoading(true);
    setResultado('');
    setErro('');
    setModeloUsado('');

    try {
      const textoProva = await extrairTextoComOCR(file, setStatus);
      setStatus('Resolvendo questões na IA...');

      const res = await fetch('/api/resolver', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ textoProva }),
      });

      const data = await res.json();

      if (res.ok && data.gabarito) {
        setResultado(data.gabarito);
        setModeloUsado(data.modelo || '');
      } else {
        setErro(data.error || 'Erro ao processar prova.');
      }
    } catch (err: unknown) {
      setErro(err instanceof Error ? err.message : 'Falha ao ler PDF.');
    } finally {
      setLoading(false);
      setStatus('');
      e.target.value = '';
    }
  }

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-md bg-zinc-900 border border-zinc-800 rounded-xl p-6 shadow-lg">
        <h1 className="text-lg font-semibold mb-4 text-center">Gabarito Rápido</h1>

        <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-zinc-700 rounded-lg cursor-pointer hover:border-emerald-500 transition">
          <span className="text-sm text-zinc-400 text-center px-4">
            {loading ? status : 'Clique para selecionar o PDF'}
          </span>
          <input
            type="file"
            accept="application/pdf"
            onChange={handleUpload}
            disabled={loading}
            className="hidden"
          />
        </label>

        {erro && (
          <div className="mt-4 bg-red-950/60 border border-red-800 rounded-lg p-3 text-red-300 text-xs font-mono break-words">
            {erro}
          </div>
        )}

        {resultado && (
          <div className="mt-6">
            <pre className="bg-zinc-950 border border-zinc-800 rounded-lg p-4 text-emerald-400 font-mono text-base leading-relaxed whitespace-pre-wrap">
              {resultado}
            </pre>
            {modeloUsado && (
              <p className="text-[11px] text-zinc-500 mt-1 text-right">
                Motor: {modeloUsado}
              </p>
            )}
            <button
              onClick={() => navigator.clipboard.writeText(resultado)}
              className="mt-3 w-full py-2 bg-zinc-800 hover:bg-zinc-700 rounded-lg text-xs font-medium transition"
            >
              Copiar Gabarito
            </button>
          </div>
        )}
      </div>
    </main>
  );
}