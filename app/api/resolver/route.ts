import { NextResponse } from 'next/server';

interface GroqModel {
  id: string;
}

interface RespostaQuestao {
  questao: number;
  calculo?: string;
  letra: string;
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { textoProva?: string };
    const textoProva = body.textoProva;

    if (!textoProva || textoProva.trim().length < 20) {
      return NextResponse.json(
        { error: 'Não foi possível ler o texto do PDF.' },
        { status: 400 }
      );
    }

    const headers = {
      Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
      'Content-Type': 'application/json',
    };

    // 1. Consulta os modelos ativos na sua conta Groq agora
    const modelsRes = await fetch('https://api.groq.com/openai/v1/models', { headers });
    const modelsData = (await modelsRes.json()) as {
      data?: GroqModel[];
      error?: { message?: string };
    };

    if (!modelsRes.ok || !Array.isArray(modelsData.data)) {
      return NextResponse.json(
        { error: modelsData?.error?.message || 'Erro ao listar modelos na Groq.' },
        { status: modelsRes.status }
      );
    }

    // Filtra apenas modelos de chat/texto (remove whisper, guard, tts, etc.)
    const modelosTexto: string[] = modelsData.data
      .map((m: GroqModel) => m.id)
      .filter(
        (id: string) =>
          !id.includes('whisper') &&
          !id.includes('guard') &&
          !id.includes('tts') &&
          !id.includes('orpheus') &&
          !id.includes('playai')
      );

    // Ordena priorizando os mais inteligentes para matemática e lógica
    const prioridades = ['70b', 'llama-4', 'qwen', '32b', '27b', '17b', '8b'];
    const filaModelos = modelosTexto.sort((a: string, b: string) => {
      const idxA = prioridades.findIndex((p) => a.toLowerCase().includes(p));
      const idxB = prioridades.findIndex((p) => b.toLowerCase().includes(p));
      return (idxA === -1 ? 99 : idxA) - (idxB === -1 ? 99 : idxB);
    });

    if (filaModelos.length === 0) {
      return NextResponse.json(
        { error: 'Nenhum modelo de texto disponível na sua conta Groq.' },
        { status: 500 }
      );
    }

    let ultimoErro = '';

    // 2. Executa no primeiro modelo ativo que responder
    for (const modelo of filaModelos.slice(0, 4)) {
      const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model: modelo,
          temperature: 0.1,
          response_format: { type: 'json_object' },
          messages: [
            {
              role: 'system',
              content:
                'Você é um professor exato de matemática e lógica. Resolva cada questão da prova passo a passo internamente e retorne APENAS um JSON estrito no formato: {"respostas": [{"questao": 1, "calculo": "conta curta", "letra": "A"}]}.',
            },
            {
              role: 'user',
              content: `Resolva todas as questões abaixo:\n\n${textoProva}`,
            },
          ],
        }),
      });

      const data = await res.json();

      if (res.ok && data?.choices?.[0]?.message?.content) {
        const conteudo = JSON.parse(data.choices[0].message.content) as {
          respostas?: RespostaQuestao[];
        };
        const lista = conteudo.respostas || [];

        const gabarito = lista
          .sort((a: RespostaQuestao, b: RespostaQuestao) => a.questao - b.questao)
          .map((item: RespostaQuestao) => `${item.questao} - ${item.letra.trim().toUpperCase()}`)
          .join('\n');

        return NextResponse.json({ gabarito, modelo });
      }

      ultimoErro = `[${modelo}] ${data?.error?.message || 'Erro desconhecido'}`;
    }

    return NextResponse.json({ error: ultimoErro }, { status: 500 });
  } catch (err: unknown) {
    const mensagem = err instanceof Error ? err.message : 'Erro interno no servidor.';
    return NextResponse.json({ error: mensagem }, { status: 500 });
  }
}