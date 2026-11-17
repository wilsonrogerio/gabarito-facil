import { NextResponse } from 'next/server';

interface GroqModel {
  id: string;
}

export async function POST(req: Request) {
  try {
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: 'GROQ_API_KEY não configurada na Vercel.' },
        { status: 500 }
      );
    }

    const body = (await req.json()) as { textoProva?: string };
    const textoProva = body.textoProva;

    if (!textoProva || textoProva.trim().length < 20) {
      return NextResponse.json(
        { error: 'Não foi possível extrair texto das imagens do PDF.' },
        { status: 400 }
      );
    }

    const headers = {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    };

    const modelsRes = await fetch('https://api.groq.com/openai/v1/models', { headers });
    const modelsData = (await modelsRes.json()) as { data?: GroqModel[] };
    const modelosTexto = (modelsData.data || [])
      .map((m) => m.id)
      .filter((id) => {
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

    const prioridades = ['120b', 'qwen', '20b', '70b', 'llama'];
    const filaModelos = modelosTexto.sort((a, b) => {
      const idxA = prioridades.findIndex((p) => a.toLowerCase().includes(p));
      const idxB = prioridades.findIndex((p) => b.toLowerCase().includes(p));
      return (idxA === -1 ? 99 : idxA) - (idxB === -1 ? 99 : idxB);
    });

    const erros: string[] = [];

    for (const modelo of filaModelos.slice(0, 3)) {
      const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model: modelo,
          temperature: 0.1,
          max_tokens: 8192,
          reasoning_effort: 'low',
          messages: [
            {
              role: 'system',
              content:
                'Você é um professor exato de matemática e lógica. O texto enviado foi extraído via OCR de uma prova, então pode conter pequenos ruídos de leitura. Interprete as fórmulas e alternativas corretamente, resolva cada questão com rigor e termine com a lista final no formato exato:\n1 - A\n2 - B',
            },
            {
              role: 'user',
              content: `Resolva todas as questões abaixo e termine com o gabarito final no formato "1 - A":\n\n${textoProva}`,
            },
          ],
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        erros.push(`${modelo}: ${data?.error?.message || res.status}`);
        continue;
      }

      const msg = data?.choices?.[0]?.message || {};
      const textoFinal: string = msg.content || msg.reasoning || '';

      const mapaRespostas = new Map<number, string>();
      const regex = /(?:quest[aã]o\s*)?\b(\d{1,2})\s*[-–:.)]\s*\*?\*?([A-E])\b/gi;
      let match: RegExpExecArray | null;

      while ((match = regex.exec(textoFinal)) !== null) {
        const num = parseInt(match[1], 10);
        const letra = match[2].toUpperCase();
        if (num >= 1 && num <= 50) {
          mapaRespostas.set(num, letra);
        }
      }

      if (mapaRespostas.size >= 3) {
        const gabarito = Array.from(mapaRespostas.entries())
          .sort((a, b) => a[0] - b[0])
          .map(([num, letra]) => `${num} - ${letra}`)
          .join('\n');

        return NextResponse.json({ gabarito, modelo });
      }

      erros.push(`${modelo}: sem padrão`);
    }

    return NextResponse.json({ error: erros.join(' | ') }, { status: 500 });
  } catch (err: unknown) {
    const mensagem = err instanceof Error ? err.message : 'Erro interno inesperado.';
    return NextResponse.json({ error: mensagem }, { status: 500 });
  }
}