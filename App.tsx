
import React, { useState, useRef, useEffect } from 'react';
import { Upload, FileText, CheckCircle, AlertTriangle, Loader2, Download, FileUp, ShieldCheck, ClipboardCheck, Search, Info, HardHat, FileSpreadsheet, FileDown, MapPin, Compass, Lock, Mail, LogOut, ArrowRight, Activity, Zap, ShieldAlert, XCircle, RefreshCw } from 'lucide-react';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { extractRelevantText, extractStandardText, extractAuditSections } from './services/pdfService';
import { analyzeReport, performConsistencyAudit } from './services/geminiService';
import { AnalysisResult, ClassificationStatus, ConsistencyAuditResult, User } from './types';
import { DEFAULT_STANDARD_PLACEHOLDER } from './constants';

function App() {
  const [user, setUser] = useState<User | null>(null);
  const [authForm, setAuthForm] = useState({ email: '', password: '' });
  const [authError, setAuthError] = useState('');

  const [terapiaFiles, setTerapiaFiles] = useState<File[]>([]);
  const [terapiaResults, setTerapiaResults] = useState<AnalysisResult[]>([]);
  const [isProcessingTerapia, setIsProcessingTerapia] = useState(false);
  
  const [patologiaFiles, setPatologiaFiles] = useState<File[]>([]);
  const [auditResults, setAuditResults] = useState<ConsistencyAuditResult[]>([]);
  const [isProcessingPatologia, setIsProcessingPatologia] = useState(false);

  const [standardText, setStandardText] = useState<string>("");
  const [standardFileName, setStandardFileName] = useState<string | null>(null);
  const [progressTerapia, setProgressTerapia] = useState({ current: 0, total: 0, currentFileName: "" });
  const [progressPatologia, setProgressPatologia] = useState({ current: 0, total: 0, currentFileName: "" });
  const [errors, setErrors] = useState<{msg: string, type: 'error' | 'warning'}[]>([]);

  const terapiaInputRef = useRef<HTMLInputElement>(null);
  const patologiaInputRef = useRef<HTMLInputElement>(null);
  const standardInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const savedUser = localStorage.getItem('artesp_user');
    if (savedUser) setUser(JSON.parse(savedUser));
  }, []);

  const handleAuth = (e: React.FormEvent) => {
    e.preventDefault();
    if (authForm.email === 'gir@gmail.com' && authForm.password === 'oae1234') {
      const loggedUser = { email: authForm.email };
      setUser(loggedUser);
      localStorage.setItem('artesp_user', JSON.stringify(loggedUser));
      setAuthError('');
    } else {
      setAuthError('E-mail ou senha incorretos. Utilize gir@gmail.com / oae1234');
    }
  };

  const logout = () => {
    setUser(null);
    localStorage.removeItem('artesp_user');
  };

  const clearErrors = () => setErrors([]);

  const handleStandardUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0]) {
      const file = e.target.files[0];
      setStandardFileName(file.name);
      try {
        const text = await extractStandardText(file);
        setStandardText(text);
      } catch (err) { 
        setErrors(prev => [...prev, {msg: `Erro ao ler norma: ${(err as Error).message}`, type: 'error'}]);
      }
    }
  };

  const processTerapia = async () => {
    if (terapiaFiles.length === 0) return;
    setIsProcessingTerapia(true);
    setTerapiaResults([]);
    setErrors([]);
    
    for (let i = 0; i < terapiaFiles.length; i++) {
      const file = terapiaFiles[i];
      setProgressTerapia({ current: i + 1, total: terapiaFiles.length, currentFileName: file.name });
      try {
        const { text, workNameCandidate, kmCandidate, sentidoCandidate } = await extractRelevantText(file);
        if (!text) throw new Error("Capítulo IV. CONCLUSÃO não encontrado no PDF.");
        
        const result = await analyzeReport(text, file.name, workNameCandidate, kmCandidate, sentidoCandidate, standardText || DEFAULT_STANDARD_PLACEHOLDER);
        setTerapiaResults(prev => [...prev, result]);
      } catch (err: any) { 
        setErrors(prev => [...prev, {msg: `Arquivo ${file.name}: ${err.message}`, type: 'error'}]);
      }
    }
    setIsProcessingTerapia(false);
  };

  const processAuditoria = async () => {
    if (patologiaFiles.length === 0) return;
    setIsProcessingPatologia(true);
    setAuditResults([]);
    setErrors([]);
    
    for (let i = 0; i < patologiaFiles.length; i++) {
      const file = patologiaFiles[i];
      setProgressPatologia({ current: i + 1, total: patologiaFiles.length, currentFileName: file.name });
      try {
        const sections = await extractAuditSections(file);
        const result = await performConsistencyAudit(sections);
        setAuditResults(prev => [...prev, result]);
      } catch (err: any) { 
        setErrors(prev => [...prev, {msg: `Auditoria ${file.name}: ${err.message}`, type: 'error'}]);
      }
    }
    setIsProcessingPatologia(false);
  };

  const downloadAuditPDF = (audit: ConsistencyAuditResult) => {
    const doc = new jsPDF();
    doc.setFontSize(16);
    doc.text("AUDITORIA DE CONSISTÊNCIA OAE", 14, 20);
    doc.setFontSize(10);
    doc.text(`Obra: ${audit.workName} | KM: ${audit.km}`, 14, 30);
    
    let finalY = 35;
    audit.categories.forEach(cat => {
      autoTable(doc, {
        startY: finalY + 5,
        head: [[cat.name.toUpperCase(), 'Cap 3', 'Anexo VII', 'Anexo II']],
        body: cat.items.map(item => [item.title, item.foundInCap3, item.foundInAnnexVII ? 'OK' : 'X', item.foundInAnnexII ? 'OK' : 'X']),
        theme: 'striped',
        headStyles: { fillColor: [30, 64, 175] }
      });
      finalY = (doc as any).lastAutoTable.finalY;
    });
    doc.save(`Auditoria_${audit.workName}.pdf`);
  };

  const downloadTerapiaExcel = () => {
    const data = terapiaResults.map(r => ({
      'Obra': r.workName, 'KM': r.km, 'Sentido': r.sentido,
      'Estrutural': r.structural, 'Funcional': r.functional, 'Durabilidade': r.durability,
      'Status': r.complianceStatus, 'Resumo': r.summary
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Resultados");
    XLSX.writeFile(wb, "Analise_Terapia.xlsx");
  };

  if (!user) {
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4">
        <div className="bg-white w-full max-w-md p-8 rounded-3xl shadow-2xl border border-slate-200">
          <div className="flex flex-col items-center mb-8">
            <div className="bg-blue-600 p-4 rounded-2xl shadow-lg mb-4">
              <ShieldCheck size={40} className="text-white" />
            </div>
            <h1 className="text-2xl font-black text-slate-900 tracking-tight text-center">ANÁLISE ARTESP</h1>
            <p className="text-slate-500 text-sm font-medium">Auditoria Técnica de Obras de Arte</p>
          </div>
          <form onSubmit={handleAuth} className="space-y-4">
            <input type="email" placeholder="gir@gmail.com" value={authForm.email} onChange={e => setAuthForm({...authForm, email: e.target.value})} className="w-full bg-slate-50 border border-slate-200 rounded-xl py-3 px-4 outline-none focus:ring-2 focus:ring-blue-500 transition-all" />
            <input type="password" placeholder="oae1234" value={authForm.password} onChange={e => setAuthForm({...authForm, password: e.target.value})} className="w-full bg-slate-50 border border-slate-200 rounded-xl py-3 px-4 outline-none focus:ring-2 focus:ring-blue-500 transition-all" />
            {authError && <p className="text-xs text-red-500 font-bold text-center">{authError}</p>}
            <button type="submit" className="w-full bg-blue-600 hover:bg-blue-700 text-white font-black py-4 rounded-xl shadow-lg flex items-center justify-center gap-2 group transition-all">
              ACESSAR SISTEMA <ArrowRight size={20} className="group-hover:translate-x-1 transition-transform" />
            </button>
          </form>
          <div className="mt-8 border-t border-slate-100 pt-6">
            <p className="text-[10px] text-center text-slate-400 uppercase font-black tracking-widest">Área Restrita - GIR</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        
        {errors.length > 0 && (
          <div className="bg-red-50 border-2 border-red-200 rounded-2xl p-4 shadow-lg">
            <div className="flex justify-between items-center mb-2">
              <h3 className="text-red-800 font-black text-xs uppercase flex items-center gap-2"><XCircle size={16} /> Alertas Críticos</h3>
              <button onClick={clearErrors} className="text-red-400 hover:text-red-600 text-[10px] font-black uppercase">Limpar</button>
            </div>
            <ul className="space-y-1">
              {errors.map((err, i) => (
                <li key={i} className="text-[11px] text-red-700 font-medium">• {err.msg}</li>
              ))}
            </ul>
          </div>
        )}

        <header className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 flex flex-col md:flex-row justify-between items-center gap-4">
          <div className="flex items-center gap-4">
            <div className="bg-blue-600 p-3 rounded-xl shadow-lg"><ShieldCheck className="w-8 h-8 text-white" /></div>
            <div>
              <h1 className="text-2xl font-black text-slate-900 tracking-tight uppercase">AUDITORIA ARTESP</h1>
              <p className="text-slate-500 text-xs font-bold uppercase tracking-widest">{user.email} <button onClick={logout} className="ml-2 text-red-400 hover:text-red-600 underline">Sair</button></p>
            </div>
          </div>
          <div className="bg-slate-50 border border-slate-200 p-3 rounded-xl flex items-center gap-3">
             <div className="text-right">
                <p className="text-[9px] text-slate-400 font-black uppercase">Norma ARTESP</p>
                <p className="text-xs font-bold text-slate-700 max-w-[120px] truncate">{standardFileName || "Padrão"}</p>
             </div>
             <button onClick={() => standardInputRef.current?.click()} className="bg-white p-2 rounded-lg hover:bg-slate-100 border border-slate-200 shadow-sm"><FileUp size={18} className="text-blue-600" /></button>
             <input type="file" className="hidden" ref={standardInputRef} onChange={handleStandardUpload} />
          </div>
        </header>

        <div className="grid lg:grid-cols-2 gap-8">
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
            <h2 className="font-black text-slate-800 uppercase tracking-tighter mb-4 flex items-center gap-2"><Search size={20} className="text-blue-600"/> 1. Patologia</h2>
            <div onClick={() => patologiaInputRef.current?.click()} className="border-2 border-dashed border-slate-200 rounded-xl p-8 flex flex-col items-center justify-center cursor-pointer hover:bg-blue-50 transition-all min-h-[140px]">
              <HardHat className="text-slate-300 mb-2" size={32} />
              <p className="text-[10px] font-black text-slate-500 uppercase">{patologiaFiles.length} Arquivos Selecionados</p>
            </div>
            <input type="file" multiple accept=".pdf" className="hidden" ref={patologiaInputRef} onChange={(e) => e.target.files && setPatologiaFiles(Array.from(e.target.files))} />
            <button disabled={isProcessingPatologia || patologiaFiles.length === 0} onClick={processAuditoria} className="mt-6 w-full bg-blue-600 hover:bg-blue-700 disabled:bg-slate-200 text-white py-4 rounded-xl font-black uppercase text-xs flex items-center justify-center gap-2 shadow-lg shadow-blue-50">
              {isProcessingPatologia ? <><Loader2 className="animate-spin" size={16}/> {progressPatologia.currentFileName}</> : 'Iniciar Auditoria de Consistência'}
            </button>
          </div>

          <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
            <h2 className="font-black text-slate-800 uppercase tracking-tighter mb-4 flex items-center gap-2"><ClipboardCheck size={20} className="text-emerald-600"/> 2. Terapia</h2>
            <div onClick={() => terapiaInputRef.current?.click()} className="border-2 border-dashed border-slate-200 rounded-xl p-8 flex flex-col items-center justify-center cursor-pointer hover:bg-emerald-50 transition-all min-h-[140px]">
              <FileText className="text-slate-300 mb-2" size={32} />
              <p className="text-[10px] font-black text-slate-500 uppercase">{terapiaFiles.length} Arquivos Selecionados</p>
            </div>
            <input type="file" multiple accept=".pdf" className="hidden" ref={terapiaInputRef} onChange={(e) => e.target.files && setTerapiaFiles(Array.from(e.target.files))} />
            <button disabled={isProcessingTerapia || terapiaFiles.length === 0} onClick={processTerapia} className="mt-6 w-full bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-200 text-white py-4 rounded-xl font-black uppercase text-xs flex items-center justify-center gap-2 shadow-lg shadow-emerald-50">
              {isProcessingTerapia ? <><Loader2 className="animate-spin" size={16}/> {progressTerapia.currentFileName}</> : 'Analisar Conclusões (IA)'}
            </button>
          </div>
        </div>

        {terapiaResults.length > 0 && (
          <div className="space-y-6 pt-6">
            <div className="flex justify-between items-center">
              <h3 className="text-xl font-black text-slate-900 uppercase">Resultados Terapia (Cap IV)</h3>
              <button onClick={downloadTerapiaExcel} className="bg-emerald-600 text-white text-[10px] font-black px-4 py-2 rounded-lg uppercase shadow-lg">Exportar Excel</button>
            </div>
            {terapiaResults.map(r => (
              <div key={r.id} className="bg-white rounded-3xl shadow-xl border border-slate-200 overflow-hidden">
                <div className="bg-slate-900 p-6 flex flex-col md:flex-row justify-between items-center gap-4 text-white">
                  <div>
                    <h4 className="text-lg font-black uppercase tracking-tighter">{r.workName}</h4>
                    <p className="text-blue-400 text-[10px] font-black uppercase">{r.km} | {r.sentido}</p>
                  </div>
                  <div className={`px-4 py-2 rounded-xl font-black text-xs uppercase ${r.complianceStatus === ClassificationStatus.COMPATIBLE ? 'bg-green-500' : 'bg-amber-500'}`}>
                    {r.complianceStatus}
                  </div>
                </div>
                <div className="p-6 grid md:grid-cols-3 gap-4">
                  <div className="bg-blue-50 p-4 rounded-2xl border border-blue-100">
                    <p className="text-[9px] font-black text-blue-600 uppercase mb-1">Nota Estrutural: {r.structural}</p>
                    <p className="text-[11px] text-slate-700 italic leading-snug">{r.structuralMotivation}</p>
                  </div>
                  <div className="bg-emerald-50 p-4 rounded-2xl border border-emerald-100">
                    <p className="text-[9px] font-black text-emerald-600 uppercase mb-1">Nota Funcional: {r.functional}</p>
                    <p className="text-[11px] text-slate-700 italic leading-snug">{r.functionalMotivation}</p>
                  </div>
                  <div className="bg-purple-50 p-4 rounded-2xl border border-purple-100">
                    <p className="text-[9px] font-black text-purple-600 uppercase mb-1">Nota Durabilidade: {r.durability}</p>
                    <p className="text-[11px] text-slate-700 italic leading-snug">{r.durabilityMotivation}</p>
                  </div>
                </div>
                <div className="p-6 bg-slate-50 border-t border-slate-200">
                  <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2">Transcrição Literal da Conclusão</p>
                  <p className="text-xs text-slate-600 leading-relaxed font-serif italic whitespace-pre-wrap">{r.summary}</p>
                </div>
              </div>
            ))}
          </div>
        )}

        {auditResults.length > 0 && (
          <div className="space-y-6 pt-6">
            <h3 className="text-xl font-black text-slate-900 uppercase">Relatórios de Auditoria (Patologia)</h3>
            {auditResults.map(audit => (
              <div key={audit.id} className="bg-white rounded-3xl shadow-xl border border-slate-200 overflow-hidden">
                <div className="bg-slate-900 p-6 flex justify-between items-center text-white">
                  <h4 className="font-black uppercase tracking-tighter">{audit.workName}</h4>
                  <button onClick={() => downloadAuditPDF(audit)} className="text-xs font-black uppercase flex items-center gap-2 underline underline-offset-4 decoration-blue-500 decoration-2"><FileDown size={14}/> PDF Auditoria</button>
                </div>
                <div className="p-6 space-y-4">
                  {audit.categories.map((cat, i) => (
                    <div key={i}>
                      <p className="text-[10px] font-black text-blue-600 uppercase mb-2 tracking-widest">{cat.name}</p>
                      <div className="grid gap-2">
                        {cat.items.map((item, idx) => (
                          <div key={idx} className="bg-slate-50 p-3 rounded-xl flex justify-between items-center border border-slate-100">
                            <div>
                              <p className="text-xs font-bold text-slate-800">{item.title}</p>
                              <p className="text-[10px] text-slate-400 italic truncate max-w-[400px]">{item.foundInCap3}</p>
                            </div>
                            <div className="flex gap-2">
                              <span className={`text-[8px] font-black px-2 py-0.5 rounded ${item.foundInAnnexVII ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>A-VII: {item.foundInAnnexVII ? 'OK' : 'X'}</span>
                              <span className={`text-[8px] font-black px-2 py-0.5 rounded ${item.foundInAnnexII ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>A-II: {item.foundInAnnexII ? 'OK' : 'X'}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

      </div>
      <footer className="mt-20 text-center pb-10">
         <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Gir Engenharia & Tecnologia - 2024</p>
      </footer>
    </div>
  );
}

export default App;
