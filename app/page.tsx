'use client';

import { useState } from 'react';

export default function Home() {
  const [resultado, setResultado] = useState('');
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(false);

  async function enviarComPersistência(file: File) {
    setLoading(true);
    setResultado('');

    for (let rodada = 1; rodada <= 5; rodada++) {
      setStatus(
        rodada === 1
          ? 'Analisando questões...'
          : `Servidor ocupado, tentando novamente (${rodada}/5)...`
      );

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
          setStatus('');
          setLoading(false);
          return;
        }
      } catch {
        // Ignora falha de rede pontual e tenta a próxima rodada
      }

      await new Promise((r) => setTimeout(r, 2000));
    }

    setStatus('');
    setResultado('Não foi possível obter resposta após 5 tentativas. Selecione o PDF novamente.');
    setLoading(false);
  }

  function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) {
      enviarComPersistência(file);
    }
    e.target.value = ''; // Permite reenviar o mesmo arquivo se precisar
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