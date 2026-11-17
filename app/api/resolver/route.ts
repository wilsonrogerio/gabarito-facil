import { NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return NextResponse.json({ error: 'Nenhum PDF enviado.' }, { status: 400 });
    }

    const bytes = await file.arrayBuffer();
    const base64Pdf = Buffer.from(bytes).toString('base64');

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: [
        {
          inlineData: {
            mimeType: 'application/pdf',
            data: base64Pdf,
          },
        },
        'Analise todas as questões desta prova (incluindo gráficos e imagens) e retorne APENAS o gabarito final.',
      ],
      config: {
        temperature: 0.1,
        systemInstruction:
          'Você é um corretor de provas exato. Resolva cada questão internamente com rigor matemático e lógico, mas na sua resposta final escreva EXCLUSIVAMENTE o número da questão e a letra da alternativa correta, uma por linha, no formato exato: "1 - A". Não escreva explicações, introduções, saudações ou textos adicionais.',
      },
    });

    return NextResponse.json({ gabarito: response.text });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Erro ao processar o PDF.' }, { status: 500 });
  }
}