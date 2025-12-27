
import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import ReactDOM from 'react-dom/client';
import { HashRouter, Routes, Route, Navigate, Link, useNavigate, useParams } from 'react-router-dom';
import { initializeApp } from "firebase/app";
import { getDatabase, ref, onValue, set, update, push, remove } from "@firebase/database";

// --- Firebase Configuration ---
const firebaseConfig = {
  apiKey: "AIzaSyDQcNfcQOkH6rfr4z_vgdG6yUYJJ0SDqKw",
  authDomain: "rdsapp-910f3.firebaseapp.com",
  databaseURL: "https://rdsapp-910f3-default-rtdb.firebaseio.com",
  projectId: "rdsapp-910f3",
  storageBucket: "rdsapp-910f3.firebasestorage.app",
  messagingSenderId: "193789962907",
  appId: "1:193789962907:web:60dae855eed6d454bef43e"
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

// --- Store / Context ---
const StoreContext = createContext<any>(null);

const StoreProvider = ({ children }: { children: React.ReactNode }) => {
    const [state, setState] = useState<any>({
        currentUser: JSON.parse(localStorage.getItem('ff_user') || 'null'),
        users: [],
        tournaments: [],
        payments: [],
        settings: {
            adminBkash: '017XXXXXXXX',
            adminNagad: '018XXXXXXXX',
            marqueeNotice: 'লোড হচ্ছে...',
            minDeposit: 100,
            minWithdraw: 200
        },
        messages: []
    });

    useEffect(() => {
        const dbRef = ref(db);
        const unsubscribe = onValue(dbRef, (snapshot) => {
            const data = snapshot.val();
            if (data) {
                const updatedUsers = data.users ? Object.values(data.users) : [];
                setState((prev: any) => {
                    const currentId = prev.currentUser?.id;
                    const updatedCurrentUser = currentId ? updatedUsers.find((u: any) => u.id === currentId) : null;
                    if (updatedCurrentUser) localStorage.setItem('ff_user', JSON.stringify(updatedCurrentUser));
                    return {
                        ...prev,
                        users: updatedUsers,
                        tournaments: data.tournaments ? Object.values(data.tournaments) : [],
                        payments: data.payments ? Object.values(data.payments) : [],
                        settings: data.settings || prev.settings,
                        messages: data.messages ? Object.values(data.messages) : [],
                        currentUser: updatedCurrentUser || prev.currentUser
                    };
                });
            }
        });
        return () => unsubscribe();
    }, []);

    const actions = {
        login: (phone: string, pass: string) => {
            if (phone === 'admin' && pass === '123456') {
                const adminUser = { id: 'admin-master', name: 'অ্যাডমিন', phone: '01700000000', balance: 99999, role: 'ADMIN' };
                localStorage.setItem('ff_user', JSON.stringify(adminUser));
                setState((prev: any) => ({ ...prev, currentUser: adminUser }));
                return { success: true };
            }
            const user = state.users.find((u: any) => u.phone === phone && u.password === pass);
            if (user) {
                localStorage.setItem('ff_user', JSON.stringify(user));
                setState((prev: any) => ({ ...prev, currentUser: user }));
                return { success: true };
            }
            return { success: false, msg: 'ভুল আইডি বা পাসওয়ার্ড!' };
        },
        register: (data: any) => {
            const exists = state.users.find((u: any) => u.phone === data.phone);
            if (exists) return { success: false, msg: 'এই নাম্বারে আইডি আছে!' };
            const id = Math.random().toString(36).substr(2, 6);
            const newUser = { ...data, id, balance: 0, role: 'PLAYER' };
            set(ref(db, 'users/' + id), newUser);
            localStorage.setItem('ff_user', JSON.stringify(newUser));
            setState((prev: any) => ({ ...prev, currentUser: newUser }));
            return { success: true };
        },
        logout: () => { localStorage.removeItem('ff_user'); setState((prev: any) => ({ ...prev, currentUser: null })); },
        setSettings: (s: any) => set(ref(db, 'settings'), s),
        addTournament: (t: any) => set(ref(db, 'tournaments/' + t.id), t),
        updateTournament: (t: any) => update(ref(db, 'tournaments/' + t.id), t),
        removeTournament: (id: string) => remove(ref(db, 'tournaments/' + id)),
        processPayment: (pid: string, status: string) => {
            const pay = state.payments.find((p: any) => p.id === pid);
            if (!pay) return;
            const user = state.users.find((u: any) => u.id === pay.userId);
            const updates: any = {};
            updates[`payments/${pid}/status`] = status;
            if (status === 'APPROVED' && user) {
                const amount = Number(pay.amount);
                const currentBalance = Number(user.balance || 0);
                updates[`users/${user.id}/balance`] = pay.type === 'DEPOSIT' ? currentBalance + amount : currentBalance - amount;
            }
            update(ref(db), updates);
        },
        updateUserBalance: (uid: string, newBalance: number) => {
            return update(ref(db, 'users/' + uid), { balance: Number(newBalance) });
        },
        joinMatch: (tid: string, names: string[], type: string, fee: number) => {
            const user = state.currentUser;
            if (!user || Number(user.balance) < fee) return { success: false, msg: 'ব্যালেন্স নেই!' };
            const t = state.tournaments.find((x: any) => x.id === tid);
            const pList = t.players || [];
            const updates: any = {};
            updates[`tournaments/${tid}/players/${pList.length}`] = { userId: user.id, names, mode: type, fee, timestamp: Date.now() };
            updates[`users/${user.id}/balance`] = Number(user.balance) - fee;
            update(ref(db), updates);
            return { success: true };
        },
        sendMessage: (msg: string, rid: string) => {
            const mid = push(ref(db, 'messages')).key;
            set(ref(db, 'messages/' + mid), { id: mid, senderId: state.currentUser.id, receiverId: rid, message: msg, timestamp: Date.now() });
        }
    };

    return <StoreContext.Provider value={{ ...state, ...actions }}>{children}</StoreContext.Provider>;
};

const useStore = () => useContext(StoreContext);

// --- Helpers ---
const getStatus = (startTime: number) => {
    const now = Date.now();
    const tenMinBefore = startTime - (10 * 60 * 1000);
    const matchEndTime = startTime + (45 * 60 * 1000);
    if (now < tenMinBefore) return { label: 'Upcoming', color: 'text-blue-400', isLive: false };
    if (now >= tenMinBefore && now < matchEndTime) return { label: 'Live', color: 'text-red-500 animate-pulse', isLive: true };
    return { label: 'Completed', color: 'text-slate-500', isLive: false };
};

const formatTime = (ts: number) => {
    return new Date(ts).toLocaleString('bn-BD', {
        day: 'numeric',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true
    });
};

// --- Layout ---
const Layout = ({ children }: any) => {
    const { currentUser, settings } = useStore();
    const navigate = useNavigate();
    return (
        <div className="min-h-screen bg-[#020617] text-slate-200 font-['Hind_Siliguri'] pb-24 selection:bg-orange-500/30">
            <header className="bg-slate-900/80 backdrop-blur-md p-4 border-b border-slate-800 flex justify-between items-center sticky top-0 z-50">
                <div onClick={() => navigate('/')} className="flex items-center gap-2 cursor-pointer active:scale-95 transition-transform">
                    <div className="bg-orange-600 w-9 h-9 rounded-xl flex items-center justify-center font-black text-white shadow-lg">FF</div>
                    <span className="font-black text-lg tracking-tighter text-white uppercase">PRO ARENA</span>
                </div>
                {currentUser ? (
                    <div className="flex items-center gap-3">
                        <div className="text-right">
                            <p className="text-[9px] text-slate-500 font-black uppercase">ব্যালেন্স</p>
                            <p className="text-xs font-black text-orange-500">৳{Number(currentUser.balance).toFixed(0)}</p>
                        </div>
                        <div onClick={() => navigate('/profile')} className="w-10 h-10 rounded-full bg-slate-800 border-2 border-slate-700 flex items-center justify-center cursor-pointer shadow-inner">👤</div>
                    </div>
                ) : (
                    <button onClick={() => navigate('/login')} className="bg-orange-600 px-6 py-2 rounded-xl text-xs font-black text-white shadow-xl">লগইন</button>
                )}
            </header>
            <div className="bg-orange-600/10 py-1.5 border-b border-orange-500/10 overflow-hidden">
                <div className="animate-marquee whitespace-nowrap text-[10px] font-bold text-orange-500 uppercase tracking-[0.2em]">
                    {settings.marqueeNotice} • {settings.marqueeNotice} • {settings.marqueeNotice}
                </div>
            </div>
            <main className="p-4 max-w-md mx-auto animate-in fade-in duration-500">{children}</main>
            <nav className="fixed bottom-0 left-0 right-0 bg-slate-900/95 backdrop-blur-xl border-t border-slate-800 flex justify-around py-4 z-50 rounded-t-[32px] shadow-2xl">
                <NavIcon to="/" icon="🏠" label="হোম" />
                <NavIcon to="/wallet" icon="💰" label="ওয়ালেট" />
                {currentUser?.role === 'ADMIN' && <NavIcon to="/admin" icon="🛠️" label="অ্যাডমিন" />}
                <NavIcon to="/profile" icon="👤" label="প্রোফাইল" />
            </nav>
        </div>
    );
};

const NavIcon = ({ to, icon, label }: any) => (
    <Link to={to} className="flex flex-col items-center gap-1 group">
        <span className="text-xl group-active:scale-75 transition-transform">{icon}</span>
        <span className="text-[9px] font-black uppercase text-slate-500 group-hover:text-orange-500 transition-colors">{label}</span>
    </Link>
);

// --- Pages ---
const Home = () => {
    const { tournaments } = useStore();
    const navigate = useNavigate();
    return (
        <div className="space-y-6">
            <div className="bg-gradient-to-br from-orange-600 to-red-700 p-8 rounded-[40px] shadow-2xl relative overflow-hidden group">
                <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -mr-16 -mt-16 blur-2xl"></div>
                <h2 className="text-2xl font-black text-white leading-none">সেরা টুর্নামেন্ট <br/> খেলুন প্রতিদিন!</h2>
                <p className="text-[10px] text-orange-100 mt-3 font-bold uppercase tracking-widest opacity-80">জয়েন করুন এবং জিতে নিন হাজার টাকা</p>
            </div>
            <h3 className="font-black text-slate-100 text-sm uppercase tracking-widest flex items-center gap-2"><span className="w-1 h-4 bg-orange-600 rounded-full"></span> টুর্নামেন্ট সমূহ</h3>
            <div className="grid gap-4">
                {tournaments.slice().sort((a:any, b:any) => b.startTime - a.startTime).map((t: any) => {
                    const status = getStatus(t.startTime);
                    return (
                        <div key={t.id} onClick={() => navigate(`/match/${t.id}`)} className="bg-slate-900/50 border border-slate-800 p-6 rounded-[32px] hover:border-orange-500/50 transition-all cursor-pointer shadow-xl group">
                            <div className="flex justify-between items-center mb-4">
                                <span className={`text-[9px] font-black uppercase tracking-widest ${status.color}`}>{status.label}</span>
                                <span className="text-[9px] text-slate-500 font-bold uppercase tracking-widest bg-slate-950 px-3 py-1 rounded-full">{formatTime(t.startTime)}</span>
                            </div>
                            <h4 className="font-black text-lg text-slate-100 uppercase group-hover:text-orange-400 transition-colors">{t.title}</h4>
                            <div className="grid grid-cols-3 gap-3 mt-6">
                                <StatBox label="বেস ফি" val={`৳${t.entryFee}`} />
                                <StatBox label="পার কিল" val={`৳${t.perKill}`} />
                                <StatBox label="১ম প্রাইজ" val={`৳${t.prizes?.first}`} />
                            </div>
                        </div>
                    );
                })}
                {!tournaments.length && <p className="text-center py-20 opacity-30 text-xs italic">কোনো টুর্নামেন্ট নেই</p>}
            </div>
        </div>
    );
};

const StatBox = ({ label, val }: any) => (
    <div className="bg-slate-950 p-3 rounded-2xl border border-slate-800 text-center shadow-inner">
        <p className="text-[7px] text-slate-500 uppercase font-black mb-1">{label}</p>
        <p className="text-xs font-black text-orange-500">{val}</p>
    </div>
);

const MatchDetails = () => {
    const { id } = useParams();
    const { tournaments, currentUser, joinMatch } = useStore();
    const t = tournaments.find((x: any) => x.id === id);
    const [mode, setMode] = useState('SOLO');
    const [names, setNames] = useState<string[]>(['']);
    const navigate = useNavigate();

    useEffect(() => {
        const count = mode === 'SOLO' ? 1 : mode === 'DUO' ? 2 : 4;
        setNames(new Array(count).fill(''));
    }, [mode]);

    if (!t) return <div className="p-40 text-center text-xs opacity-50 uppercase tracking-widest animate-pulse">লোড হচ্ছে...</div>;

    const status = getStatus(t.startTime);
    const isJoined = t.players?.some((p: any) => p.userId === currentUser?.id);
    const multiplier = mode === 'SOLO' ? 1 : mode === 'DUO' ? 2 : 4;
    const totalFee = t.entryFee * multiplier;

    const handleJoin = () => {
        if (!currentUser) return navigate('/login');
        if (names.some(n => !n.trim())) return alert('সবার গেম নাম দিন!');
        const res = joinMatch(t.id, names, mode, totalFee);
        if (res.success) alert('জয়েন করা সফল হয়েছে!'); else alert(res.msg);
    };

    return (
        <div className="space-y-6 pb-10">
            <div className="bg-slate-900 border border-slate-800 p-8 rounded-[40px] shadow-2xl">
                <div className="flex justify-between items-center mb-6">
                    <h2 className="font-black text-xl text-white uppercase">{t.title}</h2>
                    <span className={`text-[9px] font-black uppercase tracking-widest ${status.color}`}>{status.label}</span>
                </div>
                
                <div className="bg-slate-950/50 p-4 rounded-3xl border border-slate-800 text-center mb-6">
                    <p className="text-[9px] text-slate-500 font-black uppercase tracking-widest mb-1">ম্যাচ শুরু</p>
                    <p className="text-sm font-black text-orange-400">{formatTime(t.startTime)}</p>
                </div>

                {isJoined && status.isLive ? (
                    <div className="bg-green-600/10 border-2 border-green-500/50 p-8 rounded-[32px] text-center space-y-4 mb-6 shadow-xl animate-in zoom-in">
                        <p className="text-[10px] text-green-500 font-black uppercase tracking-widest">গেম রুম তথ্য</p>
                        <div className="space-y-2">
                            <p className="text-white font-black text-2xl tracking-widest">ID: {t.roomId || 'Wait...'}</p>
                            <p className="text-white font-black text-2xl tracking-widest">PASS: {t.password || 'Wait...'}</p>
                        </div>
                    </div>
                ) : isJoined ? (
                    <div className="bg-blue-600/10 p-6 rounded-[32px] text-center text-blue-400 text-[10px] font-black uppercase border border-blue-500/10 mb-6 shadow-inner">
                        আপনি সফলভাবে জয়েন করেছেন। ১০ মিনিট আগে এখানে রুম আইডি পাবেন।
                    </div>
                ) : (
                    status.label !== 'Completed' && (
                        <div className="space-y-6 mb-8">
                            <div className="space-y-3">
                                <label className="text-[10px] text-slate-500 font-black uppercase tracking-widest ml-1">কিভাবে খেলতে চান?</label>
                                <div className="flex gap-2 bg-slate-950 p-1 rounded-2xl border border-slate-800 shadow-inner">
                                    {['SOLO', 'DUO', 'SQUAD'].map(m => (
                                        <button key={m} onClick={() => setMode(m)} className={`flex-1 py-3 text-[10px] font-black rounded-xl transition-all ${mode === m ? 'bg-orange-600 text-white shadow-lg' : 'text-slate-500'}`}>{m}</button>
                                    ))}
                                </div>
                            </div>
                            <div className="space-y-3">
                                {names.map((n, i) => (
                                    <div key={i}>
                                        <label className="text-[8px] text-slate-600 uppercase font-black ml-1 mb-1 block">খেলোয়াড় {i+1} গেম নাম</label>
                                        <input value={n} onChange={e => { const nm = [...names]; nm[i] = e.target.value; setNames(nm); }}
                                               placeholder="নাম লিখুন" className="w-full bg-slate-950 border border-slate-800 p-4 rounded-2xl text-xs font-black text-white outline-none focus:border-orange-500 shadow-inner" />
                                    </div>
                                ))}
                            </div>
                            <button onClick={handleJoin} className="w-full bg-orange-600 py-5 rounded-[24px] font-black text-sm uppercase text-white shadow-xl shadow-orange-600/20 active:scale-95 transition-all">জয়েন করুন (৳{totalFee})</button>
                        </div>
                    )
                )}

                <div className="grid grid-cols-3 gap-2 pt-4 border-t border-slate-800">
                    <StatBox label="১ম পুরস্কার" val={`৳${t.prizes?.first}`} />
                    <StatBox label="২য় পুরস্কার" val={`৳${t.prizes?.second}`} />
                    <StatBox label="৩য় পুরস্কার" val={`৳${t.prizes?.third}`} />
                </div>
            </div>

            <div className="bg-slate-900 border border-slate-800 p-8 rounded-[40px] shadow-xl">
                <h3 className="text-[10px] font-black uppercase text-slate-500 tracking-widest mb-6 flex justify-between items-center">জয়েন করা প্লেয়ার ({t.players?.length || 0})</h3>
                <div className="space-y-3">
                    {t.players?.map((p: any, i: number) => (
                        <div key={i} className="bg-slate-950 p-5 rounded-[24px] border border-slate-800 flex justify-between items-center group">
                            <div>
                                <p className="text-xs font-black text-slate-200 uppercase">{p.names.join(' & ')}</p>
                                <p className="text-[8px] text-slate-500 font-bold uppercase mt-1">{p.mode} মুড</p>
                            </div>
                            <span className="text-[8px] font-black text-green-500 uppercase bg-green-500/10 px-4 py-1.5 rounded-full border border-green-500/10">Joined</span>
                        </div>
                    ))}
                    {!t.players?.length && <p className="text-center text-[10px] opacity-30 italic py-6 uppercase font-black">এখনো কেউ জয়েন করেনি</p>}
                </div>
            </div>
        </div>
    );
};

const Wallet = () => {
    const { currentUser, settings, payments } = useStore();
    const [tab, setTab] = useState('DEPOSIT');
    const [form, setForm] = useState({ amount: '', num: '', trx: '', method: 'BKASH' });

    if (!currentUser) return <div className="p-20 text-center text-xs font-black uppercase tracking-widest animate-pulse">লগইন করুন</div>;

    const handleSubmit = (e: any) => {
        e.preventDefault();
        const am = Number(form.amount);
        if (tab === 'DEPOSIT' && am < settings.minDeposit) return alert(`সর্বনিম্ন ডিপোজিট ৳${settings.minDeposit}`);
        if (tab === 'WITHDRAW' && am < settings.minWithdraw) return alert(`সর্বনিম্ন উইথড্র ৳${settings.minWithdraw}`);
        if (tab === 'WITHDRAW' && am > currentUser.balance) return alert('পর্যাপ্ত ব্যালেন্স নেই!');
        
        const pid = Math.random().toString(36).substr(2, 9);
        set(ref(db, 'payments/' + pid), { ...form, id: pid, userId: currentUser.id, userName: currentUser.name, type: tab, status: 'PENDING', timestamp: Date.now() });
        alert('আবেদন সফল হয়েছে!');
        setForm({ amount: '', num: '', trx: '', method: 'BKASH' });
    };

    return (
        <div className="space-y-6">
            <div className="bg-slate-900 p-10 rounded-[40px] border border-slate-800 text-center shadow-2xl">
                <p className="text-[10px] text-slate-500 font-black uppercase tracking-widest mb-2">বর্তমান ব্যালেন্স</p>
                <h2 className="text-5xl font-black text-orange-500 tracking-tighter">৳{Number(currentUser.balance).toFixed(0)}</h2>
            </div>
            <div className="flex bg-slate-900 p-1.5 rounded-[24px] border border-slate-800 shadow-xl">
                {['DEPOSIT', 'WITHDRAW', 'HISTORY'].map(t => (
                    <button key={t} onClick={() => setTab(t)} className={`flex-1 py-4 text-[10px] font-black rounded-2xl transition-all ${tab === t ? 'bg-orange-600 text-white shadow-lg' : 'text-slate-400'}`}>{t}</button>
                ))}
            </div>
            {tab !== 'HISTORY' ? (
                <form onSubmit={handleSubmit} className="bg-slate-900 p-8 rounded-[40px] border border-slate-800 space-y-6 shadow-2xl">
                    <div className="flex gap-3">
                        {['BKASH', 'NAGAD'].map(m => (
                            <button key={m} type="button" onClick={() => setForm({...form, method: m})} className={`flex-1 py-4 text-[10px] font-black rounded-2xl border transition-all ${form.method === m ? 'bg-orange-600/10 border-orange-500 text-orange-400' : 'bg-slate-950 border-slate-800 text-slate-500'}`}>{m}</button>
                        ))}
                    </div>
                    {tab === 'DEPOSIT' && (
                        <div className="p-6 bg-slate-950 rounded-3xl border border-orange-500/10 text-[10px] font-black text-orange-400 leading-relaxed shadow-inner">
                            টাকা সেন্ডমানি করে ট্রানজেকশন আইডি দিন:<br/><br/>
                            বিকাশ: <span className="text-white text-sm">{settings.adminBkash}</span><br/>
                            নগদ: <span className="text-white text-sm">{settings.adminNagad}</span>
                        </div>
                    )}
                    <div className="space-y-4">
                        <input type="number" placeholder="টাকার পরিমাণ (৳)" value={form.amount} onChange={e => setForm({...form, amount: e.target.value})} className="w-full bg-slate-950 border border-slate-800 p-5 rounded-2xl text-xs font-black text-white outline-none focus:border-orange-500 shadow-inner" required />
                        <input type="text" placeholder="বিকাশ/নগদ নাম্বার" value={form.num} onChange={e => setForm({...form, num: e.target.value})} className="w-full bg-slate-950 border border-slate-800 p-5 rounded-2xl text-xs font-black text-white outline-none focus:border-orange-500 shadow-inner" required />
                        {tab === 'DEPOSIT' && <input type="text" placeholder="ট্রানজেকশন আইডি" value={form.trx} onChange={e => setForm({...form, trx: e.target.value})} className="w-full bg-slate-950 border border-slate-800 p-5 rounded-2xl text-xs font-black text-white outline-none focus:border-orange-500 shadow-inner" required />}
                    </div>
                    <button className="w-full bg-orange-600 py-5 rounded-[24px] font-black text-xs uppercase text-white shadow-xl shadow-orange-600/20 active:scale-95 transition-all">নিশ্চিত করুন</button>
                </form>
            ) : (
                <div className="space-y-3">
                    {payments.filter((p:any)=>p.userId === currentUser.id).sort((a:any,b:any)=>b.timestamp-a.timestamp).map((p: any) => (
                        <div key={p.id} className="bg-slate-900 p-5 rounded-[28px] border border-slate-800 flex justify-between items-center shadow-lg group">
                            <div>
                                <p className="text-[10px] font-black text-white uppercase tracking-widest">{p.type} - {p.method}</p>
                                <p className={`text-[8px] font-black uppercase mt-2 tracking-widest ${p.status === 'APPROVED' ? 'text-green-500' : p.status === 'REJECTED' ? 'text-red-500' : 'text-yellow-500'}`}>{p.status}</p>
                            </div>
                            <p className="text-lg font-black text-orange-500 tracking-tighter">৳{p.amount}</p>
                        </div>
                    ))}
                    {!payments.filter((p:any)=>p.userId === currentUser.id).length && <p className="text-center py-20 opacity-30 text-xs italic uppercase font-black">কোনো হিস্ট্রি নেই</p>}
                </div>
            )}
        </div>
    );
};

const Admin = () => {
    const { payments, users, tournaments, settings, processPayment, addTournament, removeTournament, setSettings, updateUserBalance, sendMessage, messages } = useStore();
    const [tab, setTab] = useState('PAYMENTS');
    const [newT, setNewT] = useState<any>({ title: '', entryFee: 30, perKill: 10, startTime: Date.now() + 3600000, prizes: { first: 300, second: 150, third: 50 }, roomId: '', password: '' });
    const [chatWith, setChatWith] = useState<any>(null);
    const [reply, setReply] = useState('');

    const handleSaveTournament = () => {
        if (!newT.title) return alert('টাইটেল দিন');
        addTournament({ ...newT, id: newT.id || Math.random().toString(36).substr(2, 6), players: newT.players || [] });
        alert('ম্যাচ তথ্য সেভ হয়েছে!');
        setNewT({ title: '', entryFee: 30, perKill: 10, startTime: Date.now() + 3600000, prizes: { first: 300, second: 150, third: 50 }, roomId: '', password: '' });
    };

    return (
        <div className="space-y-6">
            <div className="flex gap-2 overflow-x-auto pb-4 scrollbar-hide">
                {['PAYMENTS', 'MATCHES', 'USERS', 'SUPPORT', 'SETTINGS'].map(t => (
                    <button key={t} onClick={() => setTab(t)} className={`px-5 py-3 rounded-2xl text-[9px] font-black uppercase border whitespace-nowrap transition-all ${tab === t ? 'bg-orange-600 text-white border-orange-500 shadow-lg' : 'bg-slate-900 text-slate-400 border-slate-800'}`}>{t}</button>
                ))}
            </div>

            {tab === 'PAYMENTS' && (
                <div className="space-y-4">
                    {payments.filter((p:any)=>p.status==='PENDING').map((p: any) => (
                        <div key={p.id} className="bg-slate-900 p-6 rounded-[32px] border border-slate-800 space-y-4 shadow-xl">
                            <div className="flex justify-between items-center">
                                <span className="text-sm font-black text-white uppercase">{p.userName}</span>
                                <span className="bg-orange-600 text-white px-4 py-1.5 rounded-full text-[10px] font-black">৳{p.amount}</span>
                            </div>
                            <p className="text-[9px] text-slate-500 font-bold uppercase tracking-widest">{p.type} | {p.method} | {p.num}</p>
                            <div className="flex gap-3 pt-2">
                                <button onClick={() => processPayment(p.id, 'APPROVED')} className="flex-1 bg-green-600 py-3 rounded-xl text-[10px] font-black uppercase text-white shadow-lg">Approve</button>
                                <button onClick={() => processPayment(p.id, 'REJECTED')} className="flex-1 bg-red-600 py-3 rounded-xl text-[10px] font-black uppercase text-white shadow-lg">Reject</button>
                            </div>
                        </div>
                    ))}
                    {!payments.filter((p:any)=>p.status==='PENDING').length && <p className="text-center py-20 opacity-30 text-xs italic uppercase font-black">কোনো পেন্ডিং রিকোয়েস্ট নেই</p>}
                </div>
            )}

            {tab === 'MATCHES' && (
                <div className="space-y-4">
                    <div className="bg-slate-900 p-8 rounded-[40px] border border-orange-500/50 space-y-4 shadow-2xl">
                        <h4 className="font-black text-[10px] text-orange-500 uppercase tracking-widest mb-4">ম্যাচ কন্ট্রোল</h4>
                        <input placeholder="টাইটেল" value={newT.title} onChange={e=>setNewT({...newT, title: e.target.value})} className="w-full bg-slate-950 p-4 rounded-xl text-xs font-black border border-slate-800 text-white outline-none focus:border-orange-500 shadow-inner" />
                        
                        <div className="grid grid-cols-3 gap-2">
                            <input type="number" placeholder="১ম প্রাইজ" value={newT.prizes.first} onChange={e=>setNewT({...newT, prizes: {...newT.prizes, first: Number(e.target.value)}})} className="bg-slate-950 p-3 rounded-xl text-[9px] font-black border border-slate-800 text-white" />
                            <input type="number" placeholder="২য় প্রাইজ" value={newT.prizes.second} onChange={e=>setNewT({...newT, prizes: {...newT.prizes, second: Number(e.target.value)}})} className="bg-slate-950 p-3 rounded-xl text-[9px] font-black border border-slate-800 text-white" />
                            <input type="number" placeholder="৩য় প্রাইজ" value={newT.prizes.third} onChange={e=>setNewT({...newT, prizes: {...newT.prizes, third: Number(e.target.value)}})} className="bg-slate-950 p-3 rounded-xl text-[9px] font-black border border-slate-800 text-white" />
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                            <input type="number" placeholder="এন্ট্রি ফি (৳)" value={newT.entryFee} onChange={e=>setNewT({...newT, entryFee: Number(e.target.value)})} className="bg-slate-950 p-4 rounded-xl text-xs font-black border border-slate-800 text-white outline-none" />
                            <input type="datetime-local" onChange={e=>setNewT({...newT, startTime: new Date(e.target.value).getTime()})} className="bg-slate-950 p-4 rounded-xl text-[10px] font-black border border-slate-800 text-white outline-none shadow-inner" />
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            <input placeholder="রুম আইডি" value={newT.roomId} onChange={e=>setNewT({...newT, roomId: e.target.value})} className="bg-slate-950 p-3 rounded-xl text-[9px] font-black border border-slate-800 text-white" />
                            <input placeholder="পাসওয়ার্ড" value={newT.password} onChange={e=>setNewT({...newT, password: e.target.value})} className="bg-slate-950 p-3 rounded-xl text-[9px] font-black border border-slate-800 text-white" />
                        </div>
                        <button onClick={handleSaveTournament} className="w-full bg-orange-600 py-4 rounded-2xl font-black text-[10px] uppercase text-white shadow-xl shadow-orange-600/20 active:scale-95 transition-all">ম্যাচ সেভ করুন</button>
                    </div>
                    <div className="grid gap-3">
                        {tournaments.map((t: any) => (
                            <div key={t.id} className="bg-slate-900 p-5 rounded-[24px] border border-slate-800 flex justify-between items-center shadow-lg hover:border-slate-700 transition-all">
                                <span className="text-xs font-black uppercase text-slate-100">{t.title}</span>
                                <div className="flex gap-2">
                                    <button onClick={() => setNewT(t)} className="text-blue-500 font-black text-[9px] uppercase active:scale-90">এডিট</button>
                                    <button onClick={() => removeTournament(t.id)} className="text-red-500 font-black text-[9px] uppercase active:scale-90">মুছুন</button>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {tab === 'USERS' && (
                <div className="space-y-3">
                    {users.map((u: any) => (
                        <div key={u.id} className="bg-slate-900 p-6 rounded-[32px] border border-slate-800 flex justify-between items-center shadow-lg group hover:border-orange-500/30 transition-all">
                            <div>
                                <p className="font-black text-xs text-white uppercase">{u.name}</p>
                                <p className="text-[9px] text-slate-500 font-bold uppercase mt-1 tracking-widest">{u.phone} | <span className="text-orange-500 font-black">৳{Number(u.balance).toFixed(0)}</span></p>
                            </div>
                            <button onClick={() => { 
                                const val = prompt(`${u.name}-এর নতুন ব্যালেন্স দিন (৳):`, u.balance); 
                                if(val !== null) updateUserBalance(u.id, Number(val)).then(() => alert('ব্যালেন্স আপডেট হয়েছে!'));
                            }} className="bg-orange-600 text-white px-5 py-2.5 rounded-xl text-[9px] font-black border border-orange-500/20 uppercase active:scale-90 shadow-lg">ব্যালেন্স এডিট</button>
                        </div>
                    ))}
                </div>
            )}

            {tab === 'SUPPORT' && (
                <div className="space-y-4">
                    {chatWith ? (
                        <div className="bg-slate-900 rounded-[32px] flex flex-col h-[450px] border border-slate-800 overflow-hidden shadow-2xl animate-in slide-in-from-right-4">
                            <div className="p-4 bg-slate-950 font-black text-[10px] flex justify-between items-center border-b border-slate-800 uppercase text-orange-500 tracking-widest">
                                চ্যাট: {chatWith.name}
                                <button onClick={() => setChatWith(null)} className="text-slate-500 text-lg">✕</button>
                            </div>
                            <div className="flex-1 overflow-y-auto p-5 space-y-4 bg-slate-950/20 scrollbar-hide">
                                {messages.filter((m: any) => m.senderId === chatWith.id || m.receiverId === chatWith.id).sort((a:any,b:any)=>a.timestamp-b.timestamp).map((m: any) => (
                                    <div key={m.id} className={`flex ${m.senderId === 'admin-master' ? 'justify-end' : 'justify-start'}`}>
                                        <div className={`max-w-[80%] px-5 py-3 rounded-2xl text-[10px] font-bold ${m.senderId === 'admin-master' ? 'bg-orange-600 text-white rounded-tr-none shadow-orange-600/10' : 'bg-slate-800 text-slate-300 rounded-tl-none shadow-black/20'} shadow-md`}>{m.message}</div>
                                    </div>
                                ))}
                            </div>
                            <form onSubmit={(e)=>{e.preventDefault(); if(reply.trim()) { sendMessage(reply, chatWith.id); setReply(''); }}} className="p-4 bg-slate-950 flex gap-2 border-t border-slate-800">
                                <input value={reply} onChange={e => setReply(e.target.value)} placeholder="রিপ্লাই দিন..." className="flex-1 bg-slate-900 p-4 rounded-2xl text-xs font-black border border-slate-800 text-white outline-none focus:border-orange-500 shadow-inner" />
                                <button type="submit" className="bg-orange-600 px-8 rounded-2xl font-black text-[10px] uppercase text-white shadow-lg active:scale-95 transition-all">পাঠান</button>
                            </form>
                        </div>
                    ) : (
                        <div className="grid gap-2">
                            {Array.from(new Set(messages.map((m:any) => m.senderId === 'admin-master' ? m.receiverId : m.senderId))).map(uid => {
                                const u = users.find((x:any) => x.id === uid);
                                if(!u || u.id === 'admin-master') return null;
                                return (
                                    <div key={u.id} onClick={() => setChatWith(u)} className="bg-slate-900 p-5 rounded-[24px] text-[11px] font-black cursor-pointer border border-slate-800 hover:border-orange-500 transition-all flex justify-between items-center group shadow-md">
                                        <span className="uppercase text-slate-100">{u.name} ({u.phone})</span>
                                        <span className="text-orange-500 opacity-0 group-hover:opacity-100 transition-all">➔</span>
                                    </div>
                                );
                            })}
                            {!messages.length && <p className="text-center py-20 opacity-30 text-xs italic uppercase font-black">কোনো ইনবক্স নেই</p>}
                        </div>
                    )}
                </div>
            )}

            {tab === 'SETTINGS' && (
                <div className="bg-slate-900 p-8 rounded-[40px] border border-slate-800 space-y-6 shadow-2xl">
                    <h4 className="font-black text-[10px] uppercase text-orange-500 tracking-[0.2em] border-b border-slate-800 pb-4">অ্যাপ সেটিংস</h4>
                    <div className="space-y-5">
                        <textarea value={settings.marqueeNotice} onChange={e => setSettings({ ...settings, marqueeNotice: e.target.value })} className="w-full bg-slate-950 p-5 rounded-2xl border border-slate-800 text-xs font-black text-slate-300 outline-none focus:border-orange-500 shadow-inner" rows={3} placeholder="মারকিউ নোটিশ..." />
                        <div className="grid grid-cols-2 gap-4">
                            <input value={settings.adminBkash} onChange={e => setSettings({ ...settings, adminBkash: e.target.value })} className="w-full bg-slate-950 p-4 rounded-xl border border-slate-800 text-xs font-black text-white outline-none shadow-inner" placeholder="বিকাশ নাম্বার" />
                            <input value={settings.adminNagad} onChange={e => setSettings({ ...settings, adminNagad: e.target.value })} className="w-full bg-slate-950 p-4 rounded-xl border border-slate-800 text-xs font-black text-white outline-none shadow-inner" placeholder="নগদ নাম্বার" />
                        </div>
                        <button onClick={()=>alert('সেভ হয়েছে!')} className="w-full bg-orange-600 py-5 rounded-[24px] font-black text-[10px] uppercase text-white shadow-xl shadow-orange-600/20 active:scale-95 transition-all">সেটিং সেভ করুন</button>
                    </div>
                </div>
            )}
        </div>
    );
};

const Profile = () => {
    const { currentUser, logout } = useStore();
    const navigate = useNavigate();
    const [newName, setNewName] = useState(currentUser?.name || '');

    if (!currentUser) return <div className="text-center p-40"><button onClick={() => navigate('/login')} className="bg-orange-600 px-8 py-3 rounded-2xl font-black text-xs uppercase text-white">লগইন</button></div>;

    const handleUpdate = () => {
        update(ref(db, 'users/' + currentUser.id), { name: newName }).then(() => alert('প্রোফাইল আপডেট হয়েছে!'));
    };

    return (
        <div className="space-y-6 pb-10">
            <div className="bg-slate-900 p-12 rounded-[48px] text-center border border-slate-800 shadow-2xl relative overflow-hidden group">
                <div className="w-24 h-24 bg-orange-600 rounded-full flex items-center justify-center text-4xl mx-auto mb-6 shadow-xl shadow-orange-600/30 text-white">👤</div>
                <h2 className="text-2xl font-black text-slate-100 uppercase tracking-tight">{currentUser.name}</h2>
                <p className="text-slate-500 text-[10px] font-black uppercase tracking-[0.3em] mt-2">{currentUser.phone}</p>
                <div className="mt-6 p-4 bg-slate-950 rounded-2xl inline-block border border-orange-500/10 shadow-inner">
                    <p className="text-orange-500 font-black text-2xl tracking-tighter">৳{Number(currentUser.balance).toFixed(0)}</p>
                </div>
            </div>
            <div className="bg-slate-900 p-8 rounded-[40px] border border-slate-800 space-y-4 shadow-xl">
                <label className="text-[9px] uppercase text-slate-500 ml-2 font-black">নাম পরিবর্তন</label>
                <input value={newName} onChange={e => setNewName(e.target.value)} className="w-full bg-slate-950 border border-slate-800 p-5 rounded-2xl text-xs font-black text-white outline-none focus:border-orange-500 shadow-inner" placeholder="আপনার নাম..." />
                <button onClick={handleUpdate} className="w-full bg-slate-800 py-4 rounded-2xl font-black text-[10px] uppercase text-white active:scale-95 transition-all shadow-lg hover:bg-slate-700">আপডেট প্রোফাইল</button>
                <div className="pt-4 border-t border-slate-800 space-y-3">
                    <button onClick={() => navigate('/contact')} className="w-full bg-orange-600/10 text-orange-400 py-5 rounded-2xl font-black text-[10px] uppercase border border-orange-500/20 active:scale-95 transition-all">সাপোর্ট চ্যাট</button>
                    <button onClick={() => { logout(); navigate('/login'); }} className="w-full bg-red-950/20 text-red-500 py-5 rounded-2xl font-black text-[10px] uppercase border border-red-900/20 active:scale-95 transition-all">লগ আউট</button>
                </div>
            </div>
        </div>
    );
};

const Contact = () => {
    const { currentUser, messages, sendMessage } = useStore();
    const [text, setText] = useState('');
    const scrollRef = useRef<any>(null);
    useEffect(() => { scrollRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);
    if (!currentUser) return <div className="p-40 text-center font-black uppercase text-xs opacity-50">লগইন করুন।</div>;
    const chat = messages.filter((m: any) => (m.senderId === currentUser.id && m.receiverId === 'admin-master') || (m.senderId === 'admin-master' && m.receiverId === currentUser.id)).sort((a: any, b: any) => a.timestamp - b.timestamp);

    return (
        <div className="flex flex-col h-[calc(100vh-280px)] bg-slate-900 rounded-[40px] border border-slate-800 overflow-hidden shadow-2xl animate-in slide-in-from-right-4">
            <div className="p-5 bg-slate-950 font-black text-[10px] uppercase text-orange-500 border-b border-slate-800 tracking-widest flex justify-between items-center">
                <span>সাপোর্ট চ্যাট</span>
                <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse shadow-[0_0_10px_#22c55e]"></span>
            </div>
            <div className="flex-1 overflow-y-auto p-6 space-y-4 bg-slate-950/20 scrollbar-hide">
                {chat.map((m: any) => (
                    <div key={m.id} className={`flex ${m.senderId === currentUser.id ? 'justify-end' : 'justify-start'}`}>
                        <div className={`max-w-[85%] px-5 py-3 rounded-[24px] text-[11px] font-bold ${m.senderId === currentUser.id ? 'bg-orange-600 text-white rounded-tr-none' : 'bg-slate-800 text-slate-300 rounded-tl-none'} shadow-md`}>{m.message}</div>
                    </div>
                ))}
                <div ref={scrollRef} />
            </div>
            <form onSubmit={e => { e.preventDefault(); if (text.trim()) { sendMessage(text, 'admin-master'); setText(''); } }} className="p-4 bg-slate-950 flex gap-3 border-t border-slate-800">
                <input value={text} onChange={e => setText(e.target.value)} placeholder="মেসেজ লিখুন..." className="flex-1 bg-slate-900 border border-slate-800 p-4 rounded-2xl text-xs font-black text-white outline-none focus:border-orange-500 shadow-inner" />
                <button type="submit" className="bg-orange-600 px-8 rounded-2xl font-black text-[10px] text-white uppercase shadow-lg shadow-orange-600/20 active:scale-95 transition-all">পাঠান</button>
            </form>
        </div>
    );
};

const Login = () => {
    const [isReg, setIsReg] = useState(false);
    const [form, setForm] = useState({ name: '', phone: '', password: '' });
    const { login, register } = useStore();
    const navigate = useNavigate();
    const submit = (e: any) => { e.preventDefault(); const res = isReg ? register(form) : login(form.phone, form.password); if (res.success) navigate('/'); else alert(res.msg); };
    return (
        <div className="bg-slate-900 p-10 rounded-[48px] border border-slate-800 shadow-2xl mt-10 animate-in zoom-in duration-300">
            <h2 className="font-black text-center mb-10 text-3xl uppercase text-white tracking-tighter">{isReg ? 'অ্যাকাউন্ট তৈরি' : 'লগইন'}</h2>
            <form onSubmit={submit} className="space-y-5">
                {isReg && (<input placeholder="পুরো নাম" onChange={e => setForm({ ...form, name: e.target.value })} className="w-full bg-slate-950 border border-slate-800 p-5 rounded-2xl text-xs font-black text-white shadow-inner outline-none focus:border-orange-500 transition-all" required />)}
                <input placeholder="ফোন নাম্বার" onChange={e => setForm({ ...form, phone: e.target.value })} className="w-full bg-slate-950 border border-slate-800 p-5 rounded-2xl text-xs font-black text-white shadow-inner outline-none focus:border-orange-500 transition-all" required />
                <input type="password" placeholder="পাসওয়ার্ড" onChange={e => setForm({ ...form, password: e.target.value })} className="w-full bg-slate-950 border border-slate-800 p-5 rounded-2xl text-xs font-black text-white shadow-inner outline-none focus:border-orange-500 transition-all" required />
                <button className="w-full bg-orange-600 py-5 rounded-[24px] font-black text-sm text-white uppercase mt-4 shadow-xl active:scale-95 transition-all tracking-widest shadow-orange-600/20">{isReg ? 'রেজিস্ট্রেশন' : 'লগইন'}</button>
            </form>
            <p onClick={() => setIsReg(!isReg)} className="text-center text-[10px] text-slate-500 mt-10 cursor-pointer uppercase font-black tracking-widest underline decoration-orange-500/30 underline-offset-4 hover:text-slate-300 transition-colors">{isReg ? 'আইডি আছে? লগইন করুন' : 'নতুন আইডি তৈরি করুন'}</p>
        </div>
    );
};

// --- App ---
const App = () => (
    <StoreProvider>
        <HashRouter>
            <Layout>
                <Routes>
                    <Route path="/" element={<Home />} />
                    <Route path="/match/:id" element={<MatchDetails />} />
                    <Route path="/wallet" element={<Wallet />} />
                    <Route path="/profile" element={<Profile />} />
                    <Route path="/login" element={<Login />} />
                    <Route path="/admin" element={<Admin />} />
                    <Route path="/contact" element={<Contact />} />
                    <Route path="*" element={<Navigate to="/" />} />
                </Routes>
            </Layout>
        </HashRouter>
    </StoreProvider>
);

const rootElement = document.getElementById('root');
if (rootElement) {
    const root = ReactDOM.createRoot(rootElement);
    root.render(<App />);
}
