export enum ClassificationStatus {
  LESS_STRICT = "Menos Criteriosa",
  MORE_STRICT = "Mais Criteriosa",
  COMPATIBLE = "Compatível",
  UNKNOWN = "Desconhecido"
}

export interface User {
  email: string;
  password?: string;
}

export interface AnalysisResult {
  id: string;
  fileName: string;
  workName: string;
  km: string;
  sentido: string;
  structural: string;
  structuralMotivation: string;
  functional: string;
  functionalMotivation: string;
  durability: string;
  durabilityMotivation: string;
  summary: string;
  pointsOfAttention: string[];
  complianceStatus: ClassificationStatus;
  complianceReasoning: string;
  processingTimeMs: number;
}

export interface AuditItem {
  title: string;
  description: string;
  foundInCap3: string;
  foundInAnnexVII: boolean;
  foundInAnnexII: boolean;
  notes: string;
}

export interface AuditCategory {
  name: string;
  items: AuditItem[];
}

export interface ConsistencyAuditResult {
  id: string;
  fileName: string;
  workName: string;
  km: string;
  sentido: string;
  categories: AuditCategory[];
  criticalInconsistencies: string[];
  recommendations: string[];
  processingTimeMs: number;
}

export interface GeminiResponseSchema {
  workName: string;
  km?: string;
  sentido?: string;
  structural: string;
  structuralMotivation: string;
  functional: string;
  functionalMotivation: string;
  durability: string;
  durabilityMotivation: string;
  summary: string;
  pointsOfAttention: string[];
  complianceStatus: "LESS_STRICT" | "MORE_STRICT" | "COMPATIBLE";
  complianceReasoning: string;
}

export interface GeminiAuditSchema {
  categories: {
    name: string;
    items: {
      title: string;
      description: string;
      foundInCap3: string;
      foundInAnnexVII: boolean;
      foundInAnnexII: boolean;
      notes: string;
    }[];
  }[];
  criticalInconsistencies: string[];
  recommendations: string[];
}