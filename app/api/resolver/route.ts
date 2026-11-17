import { NextResponse } from 'next/server';

interface GroqModel {
  id: string;
}

export async function POST(req: Request) {
  try {
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: 'GROQ_API_KEY não configurada na Vercel (faça Redeploy após salvar).' },
        { status: 500 }
      );
    }

    const body = (await req.json()) as { textoProva?: string };
    const textoProva = body.textoProva;

    if (!textoProva || textoProva.trim().length < 20) {
      return NextResponse.json(
        { error: 'Texto do PDF vazio ou ilegível.' },
        { status: 400 }
      );
    }

    const headers = {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    };

    const modelsRes = await fetch('https://api.groq.com/openai/v1/models', { headers });
    const modelsData = (await modelsRes.json()) as {
      data?: GroqModel[];
      error?: { message?: string };
    };

    if (!modelsRes.ok || !Array.isArray(modelsData.data)) {
      return NextResponse.json(
        { error: modelsData?.error?.message || `Erro HTTP ${modelsRes.status} ao listar modelos.` },
        { status: modelsRes.status }
      );
    }

    // Remove modelos de áudio, segurança e modelos não-português (allam)
    const modelosTexto: string[] = modelsData.data
      .map((m: GroqModel) => m.id)
      .filter((id: string) => {
        const lower = id.toLowerCase();
        return (
          !lower.includes('whisper') &&
          !lower.includes('guard') &&
          !lower.includes('tts') &&
          !lower.includes('orpheus') &&
          !lower.includes('playai') &&
          !lower.includes('allam') &&
          !lower.includes('compound')
        );
      });

    // Prioriza os melhores modelos disponíveis no catálogo atual da Groq
    const prioridades = ['gpt-oss', 'qwen', 'deepseek', 'llama-4', 'llama-3.3', 'llama-3.1', 'gemma', 'mistral', 'llama'];
    const filaModelos = modelosTexto.sort((a: string, b: string) => {
      const idxA = prioridades.findIndex((p) => a.toLowerCase().includes(p));
      const idxB = prioridades.findIndex((p) => b.toLowerCase().includes(p));
      return (idxA === -1 ? 99 : idxA) - (idxB === -1 ? 99 : idxB);
    });

    const erros: string[] = [];

    for (const modelo of filaModelos.slice(0, 5)) {
      const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model: modelo,
          temperature: 0.1,
          messages: [
            {
              role: 'system',
              content:
                'Você é um professor de matemática e lógica. Resolva cada questão da prova passo a passo com atenção e, ao final de todas, escreva o gabarito limpo no formato exato "1 - A" (uma questão por linha).',
            },
            {
              role: 'user',
              content: `Resolva todas as questões abaixo e termine com o gabarito no formato "1 - A":\n\n${textoProva}`,
            },
          ],
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        erros.push(`${modelo}: ${data?.error?.message || res.status}`);
        continue;
      }

      const rawContent: string = data?.choices?.[0]?.message?.content || '';
      // Remove bloco de pensamento interno <think>...</think>
      const semThink = rawContent.replace(/<think>[\s\S]*?<\/think>/gi, '');

      // Captura todas as ocorrências no padrão "1 - A", "2 - B", etc.
      const mapaRespostas = new Map<number, string>();
      const regex = /\b(\d{1,2})\s*[-–:.]\s*([A-E])\b/gi;
      let match: RegExpExecArray | null;

      while ((match = regex.exec(semThink)) !== null) {
        const num = parseInt(match[1], 10);
        const letra = match[2].toUpperCase();
        if (num >= 1 && num <= 50) {
          mapaRespostas.set(num, letra); // Mantém a última ocorrência (do gabarito final)
        }
      }

      if (mapaRespostas.size >= 3) {
        const gabarito = Array.from(mapaRespostas.entries())
          .sort((a, b) => a[0] - b[0])
          .map(([num, letra]) => `${num} - ${letra}`)
          .join('\n');

        return NextResponse.json({ gabarito, modelo });
      }

      erros.push(`${modelo}: não encontrou padrão de gabarito`);
    }

    return NextResponse.json(
      { error: `Modelos testados [${filaModelos.join(', ')}]. Erros: ${erros.join(' | ')}` },
      { status: 500 }
    );
  } catch (err: unknown) {
    const mensagem = err instanceof Error ? err.message : 'Erro interno inesperado.';
    return NextResponse.json({ error: mensagem }, { status: 500 });
  }
}