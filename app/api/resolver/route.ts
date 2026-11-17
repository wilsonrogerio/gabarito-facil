import { NextResponse } from 'next/server';

interface GroqModel {
  id: string;
}

async function resolverLoteImagens(
  modelo: string,
  imagens: string[],
  headers: Record<string, string>
) {
  const conteudoUsuario: Array<
    { type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } }
  > = [
    {
      type: 'text',
      text: 'Resolva todas as questões visíveis nestas páginas de prova com rigor matemático e lógico. Para cada questão, faça o cálculo curto e termine listando o gabarito exato no formato:\n1 - A\n2 - B',
    },
    ...imagens.map((url) => ({
      type: 'image_url' as const,
      image_url: { url },
    })),
  ];

  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model: modelo,
      temperature: 0.1,
      max_tokens: 4096,
      messages: [
        {
          role: 'system',
          content:
            'Você é um professor exato de matemática e lógica. Analise as imagens das questões (incluindo gráficos e fórmulas), resolva passo a passo de forma concisa e escreva ao final o gabarito no formato exato "1 - A".',
        },
        {
          role: 'user',
          content: conteudoUsuario,
        },
      ],
    }),
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data?.error?.message || `HTTP ${res.status}`);
  }

  return (data?.choices?.[0]?.message?.content as string) || '';
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

    const body = (await req.json()) as { imagens?: string[] };
    const imagens = body.imagens;

    if (!imagens || imagens.length === 0) {
      return NextResponse.json({ error: 'Nenhuma página recebida.' }, { status: 400 });
    }

    const headers = {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    };

    // Descobre automaticamente o modelo de visão (Llama 4) ativo na sua conta Groq
    const modelsRes = await fetch('https://api.groq.com/openai/v1/models', { headers });
    const modelsData = (await modelsRes.json()) as { data?: GroqModel[] };
    const ids = (modelsData.data || []).map((m) => m.id);

    const modeloVisao =
      ids.find((id) => id.includes('maverick')) ||
      ids.find((id) => id.includes('scout')) ||
      ids.find((id) => id.includes('llama-4')) ||
      'meta-llama/llama-4-scout-17b-16e-instruct';

    // Divide em lotes de no máximo 4 imagens por chamada (limite da API de visão da Groq é 5)
    const lotes: string[][] = [];
    for (let i = 0; i < imagens.length; i += 4) {
      lotes.push(imagens.slice(i, i + 4));
    }

    // Processa os lotes em paralelo para responder em ~2 segundos
    const textos = await Promise.all(
      lotes.map((lote) => resolverLoteImagens(modeloVisao, lote, headers))
    );

    const textoCompleto = textos.join('\n');
    const mapaRespostas = new Map<number, string>();
    const regex = /(?:quest[aã]o\s*)?\b(\d{1,2})\s*[-–:.)]\s*\*?\*?([A-E])\b/gi;
    let match: RegExpExecArray | null;

    while ((match = regex.exec(textoCompleto)) !== null) {
      const num = parseInt(match[1], 10);
      const letra = match[2].toUpperCase();
      if (num >= 1 && num <= 50) {
        mapaRespostas.set(num, letra);
      }
    }

    if (mapaRespostas.size === 0) {
      return NextResponse.json(
        { error: `Não foi possível extrair letras. Retorno: ${textoCompleto.slice(0, 200)}` },
        { status: 500 }
      );
    }

    const gabarito = Array.from(mapaRespostas.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([num, letra]) => `${num} - ${letra}`)
      .join('\n');

    return NextResponse.json({ gabarito, modelo: modeloVisao });
  } catch (err: unknown) {
    const mensagem = err instanceof Error ? err.message : 'Erro interno inesperado.';
    return NextResponse.json({ error: mensagem }, { status: 500 });
  }
}