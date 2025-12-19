
import { GoogleGenAI, Type } from "@google/genai";
import { AnalysisResult, ClassificationStatus, GeminiResponseSchema, ConsistencyAuditResult, GeminiAuditSchema } from "../types";
import { AuditSections } from "./pdfService";

const ANALYSIS_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    workName: { type: Type.STRING },
    km: { type: Type.STRING },
    sentido: { type: Type.STRING },
    structural: { type: Type.STRING },
    structuralMotivation: { type: Type.STRING, description: "Motivação literal encontrada no texto para a nota estrutural." },
    functional: { type: Type.STRING },
    functionalMotivation: { type: Type.STRING, description: "Motivação literal encontrada no texto para a nota funcional." },
    durability: { type: Type.STRING },
    durabilityMotivation: { type: Type.STRING, description: "Motivação literal encontrada no texto para a nota de durabilidade." },
    summary: { type: Type.STRING, description: "Extrato idêntico e literal da conclusão completa do texto." },
    pointsOfAttention: { type: Type.ARRAY, items: { type: Type.STRING } },
    complianceStatus: { type: Type.STRING, enum: ["LESS_STRICT", "MORE_STRICT", "COMPATIBLE"] },
    complianceReasoning: { type: Type.STRING, description: "Análise comparativa das motivações encontradas versus o que a norma ARTESP prescreve." }
  },
  required: [
    "workName", "structural", "structuralMotivation", 
    "functional", "functionalMotivation", "durability", 
    "durabilityMotivation", "summary", "pointsOfAttention", 
    "complianceStatus", "complianceReasoning"
  ]
};

const AUDIT_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    categories: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          name: { type: Type.STRING },
          items: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                title: { type: Type.STRING },
                description: { type: Type.STRING },
                foundInCap3: { type: Type.STRING },
                foundInAnnexVII: { type: Type.BOOLEAN },
                foundInAnnexII: { type: Type.BOOLEAN },
                notes: { type: Type.STRING }
              },
              required: ["title", "foundInCap3", "foundInAnnexVII", "foundInAnnexII"]
            }
          }
        },
        required: ["name", "items"]
      }
    },
    criticalInconsistencies: { type: Type.ARRAY, items: { type: Type.STRING } },
    recommendations: { type: Type.ARRAY, items: { type: Type.STRING } }
  },
  required: ["categories", "criticalInconsistencies", "recommendations"]
};

export const analyzeReport = async (
  text: string,
  fileName: string,
  detectedName: string,
  detectedKm: string,
  detectedSentido: string,
  standardContext: string
): Promise<AnalysisResult> => {
  const apiKey = process.env.API_KEY;
  if (!apiKey || apiKey === 'undefined') {
    throw new Error("API_KEY não encontrada no ambiente. Verifique o seu arquivo .env ou variáveis de ambiente.");
  }

  const ai = new GoogleGenAI({ apiKey });
  
  const systemInstruction = `
  Você é um auditor de engenharia civil rigoroso especializado em normas ARTESP.
  Sua tarefa é extrair as notas de Estrutural, Funcional e Durabilidade e suas respectivas MOTIVAÇÕES do relatório de terapia (Capítulo IV. CONCLUSÃO).
  
  REGRAS CRÍTICAS:
  1. O campo 'summary' deve conter o texto da CONCLUSÃO completa de forma IDENTICA ao original.
  2. Para cada parâmetro, extraia a motivação literal descrita (ex: 'viga V1 com fissuras').
  3. No campo 'complianceReasoning', explique se as notas do engenheiro condizem com a norma ARTESP fornecida.
  4. Use Temperatura 0 para máxima precisão técnica.
  `;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-pro-preview",
      contents: [
        { role: 'user', parts: [{ text: `Norma de Referência:\n${standardContext}\n\nTexto do Relatório:\n${text}\n\nExtraia os dados conforme o esquema JSON definido.` }] }
      ],
      config: { 
        systemInstruction,
        temperature: 0, 
        responseMimeType: "application/json", 
        responseSchema: ANALYSIS_SCHEMA 
      }
    });

    const responseText = response.text;
    if (!responseText) throw new Error("Resposta vazia do modelo Gemini.");
    
    const parsed: GeminiResponseSchema = JSON.parse(responseText);
    return {
      id: crypto.randomUUID(),
      fileName,
      workName: parsed.workName || detectedName || "OAE Não Identificada",
      km: parsed.km || detectedKm || "KM Não Identificado",
      sentido: parsed.sentido || detectedSentido || "Sentido Não Identificado",
      structural: parsed.structural,
      structuralMotivation: parsed.structuralMotivation,
      functional: parsed.functional,
      functionalMotivation: parsed.functionalMotivation,
      durability: parsed.durability,
      durabilityMotivation: parsed.durabilityMotivation,
      summary: parsed.summary,
      pointsOfAttention: parsed.pointsOfAttention,
      complianceStatus: ClassificationStatus[parsed.complianceStatus as keyof typeof ClassificationStatus] || ClassificationStatus.COMPATIBLE,
      complianceReasoning: parsed.complianceReasoning,
      processingTimeMs: 0
    };
  } catch (error: any) {
    if (error.message?.includes("API key not valid")) {
      throw new Error("Chave de API Inválida. Verifique se a chave no seu arquivo .env está correta e ativa no Google AI Studio.");
    }
    throw new Error(`Falha no processamento: ${error.message}`);
  }
};

export const performConsistencyAudit = async (sections: AuditSections): Promise<ConsistencyAuditResult> => {
  const apiKey = process.env.API_KEY;
  if (!apiKey || apiKey === 'undefined') {
    throw new Error("API_KEY não encontrada no ambiente.");
  }

  const ai = new GoogleGenAI({ apiKey });
  const startTime = performance.now();

  const systemInstruction = `
  Realize uma AUDITORIA DE CONSISTÊNCIA técnica em relatórios de OAE.
  Compare as descrições de anomalias do Capítulo 3 com as tabelas quantitativas dos Anexos II e VII.
  Identifique se o que foi descrito no texto está devidamente registrado nas tabelas e vice-versa.
  `;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-pro-preview",
      contents: [
        { role: 'user', parts: [{ text: `DADOS PARA AUDITORIA:\nCap 3: ${sections.cap3}\nAnexo II: ${sections.annexII}\nAnexo VII: ${sections.annexVII}\n\nRetorne a auditoria em JSON.` }] }
      ],
      config: {
        systemInstruction,
        temperature: 0,
        responseMimeType: "application/json",
        responseSchema: AUDIT_SCHEMA
      }
    });

    const responseText = response.text;
    if (!responseText) throw new Error("Resposta vazia do modelo Gemini.");
    
    const parsed: GeminiAuditSchema = JSON.parse(responseText);
    
    return {
      id: crypto.randomUUID(),
      fileName: sections.fileName,
      workName: sections.workNameCandidate || "Obra Não Identificada",
      km: sections.kmCandidate || "KM Não Identificado",
      sentido: sections.sentidoCandidate || "Sentido Não Identificado",
      categories: parsed.categories,
      criticalInconsistencies: parsed.criticalInconsistencies,
      recommendations: parsed.recommendations,
      processingTimeMs: Math.round(performance.now() - startTime)
    };
  } catch (error: any) {
    throw new Error(`Erro na auditoria: ${error.message}`);
  }
};
