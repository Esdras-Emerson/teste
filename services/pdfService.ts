import * as pdfjsLib from 'pdfjs-dist';

pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@5.4.449/build/pdf.worker.min.mjs`;

export interface PdfExtractionResult {
  text: string;
  workNameCandidate: string;
  kmCandidate: string;
  sentidoCandidate: string;
}

export interface AuditSections {
  cap3: string;
  cap4: string;
  annexII: string;
  annexIII: string;
  annexIV: string;
  annexVII: string;
  fileName: string;
  workNameCandidate: string;
  kmCandidate: string;
  sentidoCandidate: string;
}

const extractMetadataFromText = (pageText: string) => {
  // Regex para nome da obra/trecho: Pega o que está logo após "Trecho:"
  const nameRegex = /(?:Trecho|Obra|Local):\s*(.*?)(?:\n|km|$)/i;
  
  // Regex específica para o padrão da foto: "km 013+600 – Transversal" ou "km 013+600 - Transversal"
  // Captura o KM e o Sentido separadamente usando o separador (hífen ou travessão)
  const kmPatternRegex = /km\s*(\d+\s*[+]\s*\d+)\s*[–-]\s*(.*)/i;

  const nameMatch = pageText.match(nameRegex);
  const kmPatternMatch = pageText.match(kmPatternRegex);

  return {
    workName: nameMatch ? nameMatch[1].trim() : "",
    km: kmPatternMatch ? `km ${kmPatternMatch[1].trim()}` : "",
    sentido: kmPatternMatch ? kmPatternMatch[2].trim() : ""
  };
};

export const extractRelevantText = async (file: File): Promise<PdfExtractionResult> => {
  const arrayBuffer = await file.arrayBuffer();
  const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
  const pdf = await loadingTask.promise;
  
  let fullText = "";
  let workNameCandidate = "";
  let kmCandidate = "";
  let sentidoCandidate = "";
  let foundConclusion = false;
  let finishedConclusion = false;

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const textContent = await page.getTextContent();
    const pageText = textContent.items.map((item: any) => item.str).join(" ");
    
    if (i <= 3) {
      const meta = extractMetadataFromText(pageText);
      if (!workNameCandidate && meta.workName) workNameCandidate = meta.workName;
      if (!kmCandidate && meta.km) kmCandidate = meta.km;
      if (!sentidoCandidate && meta.sentido) sentidoCandidate = meta.sentido;
    }

    const conclusionStart = /IV\.\s*CONCLUSÃO/i;
    const conclusionEnd = /V\.\s*AÇÕES\s*RECONSTITUIDORAS/i;

    if (!foundConclusion && conclusionStart.test(pageText)) {
        foundConclusion = true;
        const match = pageText.match(conclusionStart);
        if (match && match.index !== undefined) fullText += pageText.substring(match.index) + "\n";
    } else if (foundConclusion && !finishedConclusion) {
        if (conclusionEnd.test(pageText)) {
            finishedConclusion = true;
            const match = pageText.match(conclusionEnd);
            if (match && match.index !== undefined) fullText += pageText.substring(0, match.index);
            break; 
        } else {
            fullText += pageText + "\n";
        }
    }
  }

  return {
    text: fullText.trim(),
    workNameCandidate,
    kmCandidate,
    sentidoCandidate
  };
};

export const extractAuditSections = async (file: File): Promise<AuditSections> => {
  const arrayBuffer = await file.arrayBuffer();
  const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
  const pdf = await loadingTask.promise;
  
  let sections: AuditSections = {
    cap3: "", cap4: "", annexII: "", annexIII: "", annexIV: "", annexVII: "", fileName: file.name,
    workNameCandidate: "", kmCandidate: "", sentidoCandidate: ""
  };

  let currentSection: keyof AuditSections | null = null;

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const textContent = await page.getTextContent();
    const pageText = textContent.items.map((item: any) => item.str).join(" ");

    if (i <= 3) {
      const meta = extractMetadataFromText(pageText);
      if (!sections.workNameCandidate && meta.workName) sections.workNameCandidate = meta.workName;
      if (!sections.kmCandidate && meta.km) sections.kmCandidate = meta.km;
      if (!sections.sentidoCandidate && meta.sentido) sections.sentidoCandidate = meta.sentido;
    }

    if (/3\.\s*ANOMALIAS\s*CONSTATADAS/i.test(pageText)) currentSection = "cap3";
    else if (/4\.\s*ENSAIOS/i.test(pageText)) currentSection = "cap4";
    else if (/ANEXO\s*II/i.test(pageText)) currentSection = "annexII";
    else if (/ANEXO\s*III/i.test(pageText)) currentSection = "annexIII";
    else if (/ANEXO\s*IV/i.test(pageText)) currentSection = "annexIV";
    else if (/ANEXO\s*VII/i.test(pageText)) currentSection = "annexVII";

    if (currentSection && typeof sections[currentSection] === 'string') {
      (sections[currentSection] as string) += pageText + "\n";
    }
  }

  return sections;
};

export const extractStandardText = async (file: File): Promise<string> => {
    const arrayBuffer = await file.arrayBuffer();
    const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
    const pdf = await loadingTask.promise;
    let text = "";
    const startPage = 1;
    const endPage = pdf.numPages;

    for (let i = startPage; i <= endPage; i++) {
        const page = await pdf.getPage(i);
        const content = await page.getTextContent();
        text += content.items.map((item: any) => item.str).join(" ") + "\n";
    }
    return text;
}
