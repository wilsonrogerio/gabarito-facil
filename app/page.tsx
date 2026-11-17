'use client';

import { useState } from 'react';

export default function Home() {
  const [resultado, setResultado] = useState('');
  const [modeloUsado, setModeloUsado] = useState('');
  const [erro, setErro] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setLoading(true);
    setResultado('');
    setErro('');
    setModeloUsado('');

    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await fetch('/api/resolver', {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();

      if (res.ok && data.gabarito) {
        setResultado(data.gabarito);
        setModeloUsado(data.modelo || '');
      } else {
        setErro(data.error || 'Erro ao processar prova.');
      }
    } catch (err: any) {
      setErro(err?.message || 'Falha de rede ou timeout.');
    } finally {
      setLoading(false);
      e.target.value = '';
    }
  }

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-md bg-zinc-900 border border-zinc-800 rounded-xl p-6 shadow-lg">
        <h1 className="text-lg font-semibold mb-4 text-center">Gabarito Rápido Pro</h1>

        <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-zinc-700 rounded-lg cursor-pointer hover:border-emerald-500 transition">
          <span className="text-sm text-zinc-400 text-center px-4">
            {loading ? 'Resolvendo prova (aguarde ~5s)...' : 'Clique para selecionar o PDF'}
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