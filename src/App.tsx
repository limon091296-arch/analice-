import React, { useState, useRef, useEffect, useCallback } from "react";
import { 
  CloudUpload, 
  Send, 
  ArrowUpCircle, 
  ArrowDownCircle, 
  Settings, 
  User as UserIcon, 
  Image as ImageIcon,
  Smartphone,
  X,
  History,
  LogIn,
  LogOut,
  ShieldCheck,
  AlertTriangle,
  Copy,
  Check,
  TrendingUp
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { cn } from "@/src/lib/utils";
import { Verdict, type AnalysisResult, type UserProfile, type PaymentRequest } from "./types";
import { auth, db, handleFirestoreError, OperationType } from "./lib/firebase";
import { 
  onAuthStateChanged, 
  signInWithPopup, 
  GoogleAuthProvider, 
  signOut,
  User as FirebaseUser
} from "firebase/auth";
import { 
  doc, 
  setDoc, 
  getDoc, 
  onSnapshot, 
  collection, 
  query, 
  where, 
  orderBy, 
  limit,
  updateDoc,
  serverTimestamp,
  addDoc
} from "firebase/firestore";

export default function App() {
  // Auth & Profile State
  const [fbUser, setFbUser] = useState<FirebaseUser | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  // 2FA State
  const [isTwoFactorVerified, setIsTwoFactorVerified] = useState(false);
  const [showTwoFactorModal, setShowTwoFactorModal] = useState(false);
  const [twoFactorPinInput, setTwoFactorPinInput] = useState("");
  const [isSettingUp2FA, setIsSettingUp2FA] = useState(false);
  const [newPin, setNewPin] = useState("");

  // UI State
  const [showAdminLogin, setShowAdminLogin] = useState(false);
  const [showAdminDashboard, setShowAdminDashboard] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [showSourceModal, setShowSourceModal] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [bkashNumber, setBkashNumber] = useState("019258144XX");
  
  // Analysis State
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [chatInput, setChatInput] = useState("");
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [latestResult, setLatestResult] = useState<AnalysisResult | null>(null);
  
  // Payment State
  const [myPaymentRequests, setMyPaymentRequests] = useState<PaymentRequest[]>([]);
  const [allPaymentRequests, setAllPaymentRequests] = useState<PaymentRequest[]>([]);
  const [paymentForm, setPaymentForm] = useState({
    senderNumber: "",
    trxId: "",
    amount: ""
  });

  const fileInputRef = useRef<HTMLInputElement>(null);

  // 1. Auth Listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setFbUser(user);
      if (user) {
        const userDocRef = doc(db, 'users', user.uid);
        try {
          const userDoc = await getDoc(userDocRef);
          if (!userDoc.exists()) {
            const newProfile: any = {
              username: user.displayName || "Anonymous",
              avatarUrl: user.photoURL || `https://i.pravatar.cc/100?img=${Math.floor(Math.random() * 70)}`,
              isActivated: false,
              email: user.email || ""
            };
            await setDoc(userDocRef, newProfile);
          }
        } catch (err) {
          handleFirestoreError(err, OperationType.WRITE, `users/${user.uid}`);
        }
      } else {
        setProfile(null);
        setIsAdmin(false);
      }
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // 2. Real-time Sync
  useEffect(() => {
    if (!fbUser) return;

    const unsubProfile = onSnapshot(doc(db, 'users', fbUser.uid), (doc) => {
      if (doc.exists()) {
        const data = doc.data() as UserProfile;
        setProfile(data);
        // If 2FA is enabled and we haven't verified yet, show modal
        if (data.isTwoFactorEnabled && !isTwoFactorVerified) {
          setShowTwoFactorModal(true);
        }
      }
    }, (err) => handleFirestoreError(err, OperationType.GET, `users/${fbUser.uid}`));

    const unsubAdmin = onSnapshot(doc(db, 'admins', fbUser.uid), (doc) => {
      setIsAdmin(doc.exists() || (fbUser.email === 'limon091296@gmail.com'));
    }, (err) => {
      if (fbUser.email === 'limon091296@gmail.com') setIsAdmin(true);
    });

    const qPayments = query(collection(db, 'paymentRequests'), where('userId', '==', fbUser.uid), orderBy('createdAt', 'desc'));
    const unsubMyPayments = onSnapshot(qPayments, (snapshot) => {
      const requests = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as PaymentRequest));
      setMyPaymentRequests(requests);
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'paymentRequests'));

    return () => {
      unsubProfile();
      unsubAdmin();
      unsubMyPayments();
    };
  }, [fbUser]);

  useEffect(() => {
    if (!isAdmin) return;
    const unsubAllPayments = onSnapshot(query(collection(db, 'paymentRequests'), orderBy('createdAt', 'desc'), limit(50)), (snapshot) => {
      setAllPaymentRequests(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as PaymentRequest)));
    });
    const unsubSettings = onSnapshot(doc(db, 'settings', 'global'), (doc) => {
      if (doc.exists()) setBkashNumber(doc.data().bkashNumber);
    });
    return () => { unsubAllPayments(); unsubSettings(); };
  }, [isAdmin]);

  const handleLogin = async () => {
    if (isLoggingIn) return;
    setIsLoggingIn(true);
    try {
      await signInWithPopup(auth, new GoogleAuthProvider());
    } catch (err: any) {
      if (err?.code !== 'auth/cancelled-popup-request' && err?.code !== 'auth/popup-closed-by-user') {
        console.error("Login Error:", err);
      } else {
        console.log("Login popup cancelled or closed by user.");
      }
    } finally {
      setIsLoggingIn(false);
    }
  };
  const handleLogout = () => {
    signOut(auth);
    setIsTwoFactorVerified(false);
    setShowTwoFactorModal(false);
  };

  const verifyTwoFactor = () => {
    if (profile?.twoFactorPin === twoFactorPinInput) {
      setIsTwoFactorVerified(true);
      setShowTwoFactorModal(false);
      setTwoFactorPinInput("");
    } else {
      alert("Incorrect Security PIN");
    }
  };

  const toggle2FA = async () => {
    if (!fbUser || !profile) return;
    if (profile.isTwoFactorEnabled) {
      // Disable
      try {
        await updateDoc(doc(db, 'users', fbUser.uid), {
          isTwoFactorEnabled: false,
          twoFactorPin: ""
        });
        alert("2FA Disabled");
      } catch (err) { console.error(err); }
    } else {
      // Enable - Requires PIN setup
      setIsSettingUp2FA(true);
    }
  };

  const saveNewPin = async () => {
    if (!fbUser || newPin.length < 4) {
      alert("PIN must be at least 4 digits");
      return;
    }
    try {
      await updateDoc(doc(db, 'users', fbUser.uid), {
        isTwoFactorEnabled: true,
        twoFactorPin: newPin
      });
      setIsSettingUp2FA(false);
      setIsTwoFactorVerified(true);
      setNewPin("");
      alert("2FA Enabled Successfully");
    } catch (err) { console.error(err); }
  };


  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => setImagePreview(event.target?.result as string);
      reader.readAsDataURL(file);
    }
  };

  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    const items = e.clipboardData.items;
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.indexOf("image") !== -1) {
        const blob = items[i].getAsFile();
        if (blob) {
          const reader = new FileReader();
          reader.onload = (event) => setImagePreview(event.target?.result as string);
          reader.readAsDataURL(blob);
        }
      }
    }
  }, []);

  const processAnalysis = async () => {
    if (profile?.isTwoFactorEnabled && !isTwoFactorVerified) { setShowTwoFactorModal(true); return; }
    if (!profile?.isActivated && !isAdmin) { setShowPaymentModal(true); return; }
    if (!imagePreview && !chatInput) return;
    setAnalysisLoading(true);
    setLatestResult(null);

    try {
      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: imagePreview, prompt: chatInput })
      });
      const rawData = await response.json();
      const analysisData = {
        verdict: rawData.verdict || "NEUTRAL",
        reason: rawData.reason || "Analysis complete.",
        confidence: rawData.confidence || 0,
        userId: fbUser?.uid || "unknown",
        timestamp: Date.now()
      };
      await addDoc(collection(db, 'analyses'), analysisData);
      setLatestResult({
        ...analysisData,
        analysisId: "TR-" + Math.random().toString(36).substr(2, 6).toUpperCase()
      } as any);
    } catch (error) {
      console.error(error);
      alert("Analysis failed.");
    } finally {
      setAnalysisLoading(false);
    }
  };

  const submitPayment = async () => {
    if (!fbUser || !paymentForm.senderNumber || !paymentForm.trxId || !paymentForm.amount) return;
    try {
      await addDoc(collection(db, 'paymentRequests'), {
        ...paymentForm,
        amount: parseFloat(paymentForm.amount),
        status: 'pending',
        userId: fbUser.uid,
        createdAt: Date.now()
      });
      setShowPaymentModal(false);
      alert("Submitted!");
    } catch (err) { handleFirestoreError(err, OperationType.WRITE, 'paymentRequests'); }
  };

  const handleAdminAction = async (requestId: string, status: 'approved' | 'rejected', userId: string) => {
    try {
      await updateDoc(doc(db, 'paymentRequests', requestId), { status });
      if (status === 'approved') await updateDoc(doc(db, 'users', userId), { isActivated: true });
    } catch (err) { console.error(err); }
  };

  const updateBkashNum = async () => {
    try { await setDoc(doc(db, 'settings', 'global'), { bkashNumber }, { merge: true }); alert("Updated!"); } catch (err) { console.error(err); }
  };

  const copyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    alert("Code copied to clipboard!");
  };

  const [activeSourceTab, setActiveSourceTab] = useState<'app' | 'css' | 'server'>('app');

  if (loading) return (
    <div className="min-h-screen bg-[#0b0e14] flex items-center justify-center">
      <div className="text-[#00e676] font-black text-2xl animate-pulse">TRADERSENSE AI</div>
    </div>
  );

  if (!fbUser) return (
    <div className="min-h-screen bg-[#0b0e14] flex items-center justify-center p-4 relative">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-[#00e676]/5 blur-[120px] rounded-full" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-blue-500/5 blur-[120px] rounded-full" />
      <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="max-w-md w-full bg-[#161a23] p-10 rounded-3xl border border-white/5 text-center shadow-2xl relative z-10">
        <div className="w-16 h-16 bg-[#00e676] rounded-2xl mx-auto mb-6 flex items-center justify-center shadow-[0_0_25px_rgba(0,230,118,0.2)]">
            <TrendingUp className="w-8 h-8 text-black" />
        </div>
        <h1 className="text-2xl font-black text-white mb-2 uppercase tracking-tighter">TRADERSENSE <span className="text-[#00e676]">AI</span></h1>
        <p className="text-slate-400 text-[10px] font-black mb-8 uppercase tracking-[0.3em]">Neural Analysis Engine</p>
        <button 
          onClick={handleLogin} 
          disabled={isLoggingIn}
          className="w-full bg-white text-black py-4 rounded-xl font-black flex items-center justify-center gap-3 hover:bg-slate-200 transition-all active:scale-95 shadow-xl disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isLoggingIn ? (
            <div className="w-5 h-5 border-2 border-black border-t-transparent animate-spin rounded-full" />
          ) : (
            <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/smartlock/google.svg" className="w-5 h-5" alt="G" />
          )}
          {isLoggingIn ? "LOGGING IN..." : "CONTINUE WITH GOOGLE"}
        </button>
      </motion.div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#0b0e14] text-white flex flex-col font-sans overflow-x-hidden" onPaste={handlePaste}>
      <nav className="navbar px-4 md:px-6">
        <div className="logo whitespace-nowrap text-lg md:text-xl">TRADER<span>SENSEAI</span></div>
        <div className="nav-right gap-3 md:gap-5">
          <div className="server-status hidden lg:flex"><span className="status-dot"></span> LOW LATENCY NODE</div>
          <button className="btn-action-panel text-[10px] md:text-xs px-2 md:px-3 py-1.5" onClick={() => setShowAdminLogin(true)}>ADMIN</button>
          <div className="profile-trigger p-1 md:py-1.5 md:px-3.5" onClick={() => setShowProfileModal(true)}>
            <img src={profile?.avatarUrl || `https://i.pravatar.cc/100?img=33`} alt="Avatar" className="w-7 h-7 md:w-8 md:h-8" />
            <div className="profile-info hidden md:flex">
              <span className="text-[13px] font-bold">{profile?.username || "Guest"}</span>
              <span className={cn("user-status-badge font-black", profile?.isActivated ? "text-[#00e676]" : "text-[#ff3333]")}>
                {profile?.isActivated ? "VERIFIED" : "UNVERIFIED"}
              </span>
            </div>
          </div>
        </div>
      </nav>

      <main className="main-container p-4 md:p-6">
        <div className="dashboard-content w-full max-w-4xl mx-auto flex flex-col gap-6">
          <section className="card p-5 md:p-8">
            <div className="card-title-container flex-col sm:flex-row items-start sm:items-center gap-3">
              <div className="card-title"><span className="dot"></span> VISUAL MARKET INTELLIGENCE</div>
              <span className="status-badge badge-node self-start sm:self-auto">NODE: ALPHA_SYNC</span>
            </div>
            <div className="upload-zone py-8 md:py-12" onClick={() => fileInputRef.current?.click()}>
              {imagePreview ? (
                <div className="relative inline-block group">
                    <img src={imagePreview} className="max-h-[300px] rounded-lg shadow-2xl border border-white/10" alt="Chart" />
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center rounded-lg">
                        <span className="bg-red-500 text-white text-[10px] font-black px-3 py-1 rounded" onClick={(e) => { e.stopPropagation(); setImagePreview(null); }}>REMOVE</span>
                    </div>
                </div>
              ) : (
                <div className="flex flex-col items-center">
                  <CloudUpload className="upload-icon" />
                  <p className="font-black text-lg">CLICK OR DRAG CHART IMAGE</p>
                  <p className="text-[10px] text-slate-500 mt-2 tracking-widest uppercase">Supported: PNG, JPG, WEBP (MAX 5MB)</p>
                </div>
              )}
              <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={handleFileSelect} />
            </div>
          </section>

          <section className="card p-5 md:p-8">
            <div className="card-title mb-4"><span className="dot"></span> NEURAL INPUT COMMAND</div>
            <div className="input-bar-container flex-col sm:flex-row p-2 gap-2">
              <div className="input-wrapper w-full">
                <ImageIcon className="text-slate-500 w-5 h-5 flex-shrink-0" />
                <input type="text" placeholder="Type prompt or paste chart (Ctrl+V)..." className="w-full bg-transparent border-none outline-none text-white text-sm" value={chatInput} onChange={e => setChatInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && processAnalysis()} />
              </div>
              <button className="btn-execute w-full sm:w-auto justify-center py-3 sm:py-2.5" disabled={analysisLoading} onClick={processAnalysis}>
                {analysisLoading ? <div className="w-4 h-4 border-2 border-black border-t-transparent animate-spin rounded-full" /> : <Send className="w-4 h-4" />}
                EXECUTE
              </button>
            </div>
          </section>

          <section className="card p-5 md:p-8">
            <div className="card-title-container"><div className="card-title"><span className="dot"></span> MARKET ANALYSIS VERDICT</div></div>
            <div className="verdict-box border border-white/5 bg-[#11151d] p-6 md:p-8 rounded-xl flex-col md:flex-row justify-between items-start md:items-center gap-6">
              <div className="w-full md:w-auto">
                <p className="text-[10px] text-slate-500 uppercase tracking-widest font-black mb-2">Neural Prediction</p>
                <div className="verdict-signal text-xl md:text-2xl">
                  {analysisLoading ? (
                      <span className="animate-pulse text-slate-400">ANALYZING CANDLES...</span>
                  ) : latestResult ? (
                    <div className={cn("flex flex-wrap items-center gap-3", latestResult.verdict === Verdict.UP ? "signal-up" : "signal-down")}>
                      {latestResult.verdict === Verdict.UP ? "UP (CALL)" : "DOWN (PUT)"}
                      {latestResult.verdict === Verdict.UP ? <ArrowUpCircle className="w-7 h-7 md:w-8 md:h-8" /> : <ArrowDownCircle className="w-7 h-7 md:w-8 md:h-8" />}
                    </div>
                  ) : (
                      <span className="text-slate-600">AWAITING MARKET DATA...</span>
                  )}
                </div>
              </div>
              <div className="text-left md:text-right w-full md:w-auto flex flex-col items-start md:items-end">
                <p className="text-[10px] text-slate-500 uppercase tracking-widest font-black mb-1">Confidence</p>
                <div className={cn("text-4xl md:text-5xl font-black leading-tight", latestResult ? "text-[#00e676]" : "text-slate-800")}>
                    {latestResult?.confidence || 0}%
                </div>
              </div>
            </div>
            {latestResult?.reason && (
                <div className="mt-4 p-4 border-l-2 border-[#00e676] bg-white/5 rounded-r-xl">
                    <p className="text-sm text-slate-400 italic"><span className="text-[#00e676] font-bold not-italic mr-2">LOG:</span>{latestResult.reason}</p>
                </div>
            )}
          </section>
        </div>
      </main>

      <a href="https://chat.whatsapp.com/KofkgMptXzxAuSujZbYeK9" target="_blank" rel="noreferrer" className="whatsapp-float">
        <svg className="w-8 h-8" fill="currentColor" viewBox="0 0 24 24">
            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
        </svg>
      </a>

      <AnimatePresence>
        {showTwoFactorModal && (
          <div className="modal-overlay">
            <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="modal-box text-center">
              <ShieldCheck className="w-12 h-12 text-[#00e676] mx-auto mb-4" />
              <div className="card-title mb-2 justify-center">SECURITY VERIFICATION</div>
              <p className="text-slate-400 text-xs mb-6 uppercase tracking-[0.2em]">Enter your security PIN to continue session</p>
              <div className="form-group">
                <input 
                  type="password" 
                  className="form-control text-center text-2xl tracking-[1em] font-black py-4" 
                  placeholder="******" 
                  value={twoFactorPinInput} 
                  onChange={e => setTwoFactorPinInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && verifyTwoFactor()}
                />
              </div>
              <button className="btn-execute w-full py-4" onClick={verifyTwoFactor}>VERIFY IDENTITY</button>
              <button className="w-full text-slate-500 text-[10px] font-black uppercase mt-6" onClick={handleLogout}>LOGOUT SESSION</button>
            </motion.div>
          </div>
        )}

        {isSettingUp2FA && (
          <div className="modal-overlay">
            <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="modal-box">
              <div className="card-title mb-6">SETUP SECURITY PIN</div>
              <p className="text-slate-400 text-[10px] mb-6 uppercase tracking-widest leading-relaxed">Create a secure PIN. This PIN will be required every time you login to keep your account safe from unauthorized exports or analysis.</p>
              <div className="form-group">
                <label>NEW SECURITY PIN (min 4 digits)</label>
                <input 
                  type="password" 
                  className="form-control text-center text-lg font-bold" 
                  placeholder="Enter PIN" 
                  value={newPin} 
                  onChange={e => setNewPin(e.target.value)} 
                />
              </div>
              <div className="flex gap-4">
                <button className="btn-execute flex-1" onClick={saveNewPin}>ENABLE 2FA</button>
                <button className="btn-execute flex-1 bg-slate-700" onClick={() => setIsSettingUp2FA(false)}>CANCEL</button>
              </div>
            </motion.div>
          </div>
        )}

        {showPaymentModal && (
          <div className="modal-overlay">
            <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }} className="modal-box">
              <div className="bkash-header">বিকাশ পেমেন্ট অ্যাক্টিভেশন</div>
              <div className="space-y-4">
                <div className="form-group">
                    <label>Merchant Number (Send Money)</label>
                    <input type="text" className="form-control text-center text-[#00e676] font-bold text-lg" value={bkashNumber} readOnly />
                </div>
                <div className="form-group"><label>Sender Number</label><input type="text" className="form-control" placeholder="017XXXXXXXX" value={paymentForm.senderNumber} onChange={e => setPaymentForm({...paymentForm, senderNumber: e.target.value})} /></div>
                <div className="form-group"><label>TrxID</label><input type="text" className="form-control uppercase" placeholder="8X7Y6Z" value={paymentForm.trxId} onChange={e => setPaymentForm({...paymentForm, trxId: e.target.value})} /></div>
                <div className="form-group"><label>Amount</label><input type="number" className="form-control" placeholder="BDT" value={paymentForm.amount} onChange={e => setPaymentForm({...paymentForm, amount: e.target.value})} /></div>
                <button className="btn-execute w-full bg-[#d12053] text-white py-4 mt-2" onClick={submitPayment}>সাবমিট করুন</button>
                <p className="text-center text-xs cursor-pointer text-slate-500 pt-4" onClick={() => setShowPaymentModal(false)}>[বন্ধ করুন]</p>
              </div>
            </motion.div>
          </div>
        )}

        {showProfileModal && (
          <div className="modal-overlay">
            <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }} className="modal-box">
              <div className="card-title mb-6">UserProfile Interface</div>
              <div className="space-y-5">
                <div className="form-group">
                    <label>Username</label>
                    <input type="text" className="form-control" value={profile?.username || ""} onChange={e => setProfile(prev => prev ? {...prev, username: e.target.value} : null)} onBlur={e => fbUser && updateDoc(doc(db, 'users', fbUser.uid), { username: e.target.value })} />
                </div>
                <div className="flex flex-col gap-3">
                  <div className="p-4 bg-white/5 rounded-xl border border-white/5 flex items-center justify-between">
                    <div>
                        <p className="text-[11px] font-black uppercase tracking-widest text-[#00e676]">Identity Protection</p>
                        <p className="text-[10px] text-slate-500 mt-1 uppercase">Secondary PIN Verification</p>
                    </div>
                    <button 
                      onClick={toggle2FA}
                      className={cn(
                        "px-3 py-1.5 rounded-lg text-[9px] font-black uppercase transition-all",
                        profile?.isTwoFactorEnabled ? "bg-red-500/20 text-red-500 border border-red-500/30" : "bg-[#00e676]/20 text-[#00e676] border border-[#00e676]/30"
                      )}
                    >
                      {profile?.isTwoFactorEnabled ? "DISABLE 2FA" : "ENABLE 2FA"}
                    </button>
                  </div>
                  <div className="flex gap-4">
                      <button 
                         className="btn-execute flex-1" 
                         onClick={() => {
                             if (profile?.isTwoFactorEnabled && !isTwoFactorVerified) {
                                setShowTwoFactorModal(true);
                                return;
                             }
                             setShowProfileModal(false);
                             setShowSourceModal(true);
                         }}
                      >
                       <Copy className="w-4 h-4 mr-2" />
                       EXPORT CODE
                      </button>
                      <button className="btn-execute flex-1 bg-slate-700" onClick={() => setShowProfileModal(false)}>CLOSE</button>
                  </div>
                </div>
                <button className="w-full text-red-500 text-[10px] font-black uppercase tracking-widest pt-6 border-t border-white/5" onClick={handleLogout}><LogOut className="w-4 h-4 inline-block mr-2" /> DISCONNECT SESSION</button>
              </div>
            </motion.div>
          </div>
        )}

        {showAdminLogin && (
          <div className="modal-overlay">
            <motion.div initial={{ scale: 0.9 }} animate={{ scale: 1 }} exit={{ scale: 0.9 }} className="modal-box max-w-sm">
              <div className="card-title text-sm mb-6 uppercase tracking-widest">Admin Authorization</div>
              <div className="space-y-4">
                <input type="email" id="adm-email" className="form-control" placeholder="Admin ID" />
                <input type="password" id="adm-pass" className="form-control" placeholder="Security Key" />
                <button className="btn-execute w-full" onClick={() => {
                  const e = (document.getElementById('adm-email') as HTMLInputElement).value;
                  const p = (document.getElementById('adm-pass') as HTMLInputElement).value;
                  if (e === "limon258144@gmail.com" && p === "limon000") { setShowAdminLogin(false); setShowAdminDashboard(true); } else { alert("ACCESS DENIED"); }
                }}>AUTHORIZE</button>
                <button className="w-full text-slate-500 text-[10px] font-black uppercase" onClick={() => setShowAdminLogin(false)}>ABORT</button>
              </div>
            </motion.div>
          </div>
        )}

        {showAdminDashboard && (
          <div className="modal-overlay">
            <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} className="modal-box max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
              <div className="card-title mb-6">ADMIN CORE CONTROL</div>
              <div className="space-y-6 flex-1 overflow-y-auto pr-2 custom-scrollbar">
                <div className="bg-white/5 p-6 rounded-xl border border-white/5">
                    <label className="text-xs uppercase text-slate-500 font-black mb-2 block tracking-widest">Global Bkash Target</label>
                    <div className="flex gap-4">
                        <input type="text" className="form-control flex-1 font-mono text-[#00e676]" value={bkashNumber} onChange={e => setBkashNumber(e.target.value)} />
                        <button onClick={updateBkashNum} className="btn-execute bg-[#00e676] text-black">UPDATE</button>
                    </div>
                </div>
                <div className="space-y-3">
                  <p className="text-xs font-black uppercase text-slate-500 tracking-widest px-2">Payment Inbound Queue</p>
                  {allPaymentRequests.length === 0 ? <p className="text-center py-12 text-slate-600 text-sm">No pending requests...</p> : allPaymentRequests.map((req, idx) => (
                    <div key={`admin-req-${req.id || idx}`} className="payment-req-item bg-[#1e2330] p-4 rounded-xl border border-white/5 flex justify-between items-center">
                      <div>
                          <p className="text-white font-bold">{req.senderNumber}</p>
                          <p className="text-[10px] text-slate-500 font-mono mt-1">{req.amount} BDT / {req.trxId}</p>
                      </div>
                      {req.status === 'pending' ? (
                          <div className="flex gap-2">
                             <button className="bg-[#00e676] text-black py-1.5 px-3 rounded font-black text-[10px] uppercase" onClick={() => handleAdminAction(req.id, 'approved', req.userId)}>APPROVE</button>
                             <button className="bg-red-500 text-white py-1.5 px-3 rounded font-black text-[10px] uppercase" onClick={() => handleAdminAction(req.id, 'rejected', req.userId)}>REJECT</button>
                          </div>
                      ) : (
                          <span className={cn("text-[10px] font-black uppercase", req.status === 'approved' ? "text-[#00e676]" : "text-red-500")}>{req.status}</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
              <button className="btn-execute w-full bg-slate-700 mt-6" onClick={() => setShowAdminDashboard(false)}>EXIT CONTROL</button>
            </motion.div>
          </div>
        )}
        {showSourceModal && (
          <div className="modal-overlay">
            <motion.div 
               initial={{ scale: 0.9, opacity: 0 }} 
               animate={{ scale: 1, opacity: 1 }} 
               exit={{ scale: 0.9, opacity: 0 }} 
               className="modal-box max-w-4xl w-[95%] h-[80vh] flex flex-col p-6"
            >
              <div className="flex justify-between items-center mb-6">
                <h3 className="card-title text-sm"><span className="dot"></span> SOURCE CODE HUB</h3>
                <button onClick={() => setShowSourceModal(false)} className="text-slate-500 hover:text-white"><X className="w-6 h-6" /></button>
              </div>

              <div className="flex gap-2 mb-6 overflow-x-auto pb-2 scrollbar-hide">
                {(['app', 'css', 'server'] as const).map(tab => (
                   <button 
                    key={`source-tab-${tab}`}
                    onClick={() => setActiveSourceTab(tab)}
                    className={cn(
                        "px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest border transition-all whitespace-nowrap",
                        activeSourceTab === tab ? "bg-[#00e676] text-black border-[#00e676]" : "bg-transparent text-slate-500 border-slate-800"
                    )}
                   >
                    {tab === 'app' ? 'App.tsx' : tab === 'css' ? 'index.css' : 'server.ts'}
                   </button>
                ))}
              </div>

              <div className="flex-1 bg-[#0b0e14] rounded-2xl border border-white/5 p-4 overflow-hidden flex flex-col relative group">
                <button 
                  onClick={() => {
                    const content = document.getElementById('code-content')?.innerText || "";
                    copyCode(content);
                  }}
                  className="absolute top-6 right-6 bg-white/10 hover:bg-white/20 p-3 rounded-xl backdrop-blur-md opacity-0 group-hover:opacity-100 transition-opacity z-10"
                >
                  <Copy className="w-5 h-5 text-white" />
                </button>
                
                <pre id="code-content" className="flex-1 overflow-auto text-[11px] font-mono text-slate-400 p-2 custom-scrollbar">
{activeSourceTab === 'app' ? `// App.tsx Logic
import React, { useState, useRef, useEffect, useCallback } from "react";
// ... (Your main React Code)` : activeSourceTab === 'css' ? `/* index.css Styling */
@theme {
  --bg-color: #0b0e14;
  --accent-green: #00e676;
  ...
}` : `// server.ts Node Backend
import express from "express";
import { GoogleGenAI } from "@google/genai";
...`}
                </pre>
              </div>

              <p className="mt-4 text-[10px] text-slate-600 font-bold uppercase tracking-widest text-center">Open this file on your local machine to build the site.</p>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
