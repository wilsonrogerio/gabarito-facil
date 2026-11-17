'use client';

import { useState } from 'react';
import * as pdfjsLib from 'pdfjs-dist';

// Aponta o worker para o CDN oficial correspondente à versão instalada
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;

async function extrairTextoPdf(file: File): Promise<string> {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  let textoCompleto = '';

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const strings = content.items.map((item: any) => item.str);
    textoCompleto += `--- Página ${i} ---\n${strings.join(' ')}\n\n`;
  }

  return textoCompleto;
}

export default function Home() {
  const [resultado, setResultado] = useState('');
  const [erro, setErro] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setLoading(true);
    setResultado('');
    setErro('');

    try {
      const textoProva = await extrairTextoPdf(file);

      const res = await fetch('/api/resolver', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ textoProva }),
      });

      const data = await res.json();

      if (res.ok && data.gabarito) {
        setResultado(data.gabarito);
      } else {
        setErro(data.error || 'Erro ao processar.');
      }
    } catch (err: any) {
      setErro(err?.message || 'Falha ao ler PDF.');
    } finally {
      setLoading(false);
      e.target.value = '';
    }
  }

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-md bg-zinc-900 border border-zinc-800 rounded-xl p-6 shadow-lg">
        <h1 className="text-lg font-semibold mb-4 text-center">Gabarito Instantâneo</h1>

        <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-zinc-700 rounded-lg cursor-pointer hover:border-emerald-500 transition">
          <span className="text-sm text-zinc-400">
            {loading ? 'Resolvendo...' : 'Clique para selecionar o PDF'}
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
          <div className="mt-4 bg-red-950/60 border border-red-800 rounded-lg p-3 text-red-300 text-xs font-mono">
            {erro}
          </div>
        )}

        {resultado && (
          <div className="mt-6">
            <pre className="bg-zinc-950 border border-zinc-800 rounded-lg p-4 text-emerald-400 font-mono text-base leading-relaxed whitespace-pre-wrap">
              {resultado}
            </pre>
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