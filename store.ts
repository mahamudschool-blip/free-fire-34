
import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { initializeApp } from "firebase/app";
import { getDatabase, ref, onValue, set, update, push, remove } from "@firebase/database";
import { User, Tournament, PaymentRequest, AppSettings, ChatMessage } from './types';

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

interface State {
  currentUser: User | null;
  users: User[];
  tournaments: Tournament[];
  payments: PaymentRequest[];
  settings: AppSettings;
  messages: ChatMessage[];
}

interface StoreContextType extends State {
  login: (identifier: string, password: string) => { success: boolean; msg: string };
  register: (newUser: any) => { success: boolean; msg: string };
  logout: () => void;
  updateProfile: (updatedUser: Partial<User>) => void;
  adminUpdateUser: (userId: string, updates: Partial<User>) => void;
  addTournament: (t: Tournament) => void;
  removeTournament: (id: string) => void;
  updateTournament: (updated: Tournament) => void;
  addPaymentRequest: (p: PaymentRequest) => void;
  processPayment: (id: string, status: 'APPROVED' | 'REJECTED') => void;
  joinTournament: (tournamentId: string, playerNames: string[], type: string, fee: number) => { success: boolean; msg: string };
  setSettings: (s: AppSettings) => void;
  sendMessage: (msg: string, receiverId: string) => void;
}

const StoreContext = createContext<StoreContextType | undefined>(undefined);

export const StoreProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [state, setState] = useState<State>({
    currentUser: JSON.parse(localStorage.getItem('ff_user') || 'null'),
    users: [],
    tournaments: [],
    payments: [],
    settings: {
      adminBkash: '017XXXXXXXX',
      adminNagad: '019XXXXXXXX',
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
        const allUsers = data.users ? (Object.values(data.users) as User[]) : [];
        const allTournaments = data.tournaments ? (Object.values(data.tournaments) as Tournament[]) : [];
        const allPayments = data.payments ? (Object.values(data.payments) as PaymentRequest[]) : [];
        const allMessages = data.messages ? (Object.values(data.messages) as ChatMessage[]) : [];
        
        setState(prev => {
          let updatedCurrentUser = prev.currentUser;
          if (prev.currentUser) {
            const freshUserData = allUsers.find(u => u.id === prev.currentUser?.id);
            if (freshUserData) {
              updatedCurrentUser = freshUserData;
              localStorage.setItem('ff_user', JSON.stringify(freshUserData));
            }
          }
          return {
            ...prev,
            users: allUsers,
            tournaments: allTournaments,
            payments: allPayments,
            messages: allMessages,
            settings: data.settings || prev.settings,
            currentUser: updatedCurrentUser
          };
        });
      }
    });
    return () => unsubscribe();
  }, []);

  const login = (identifier: string, password: string) => {
    if (identifier === 'admin' && password === '123456') {
      const adminUser: User = { id: 'admin-1', name: 'অ্যাডমিন মাস্টার', phone: '01700000000', email: 'admin', balance: 99999, role: 'ADMIN', joinedMatches: [] };
      localStorage.setItem('ff_user', JSON.stringify(adminUser));
      setState(prev => ({ ...prev, currentUser: adminUser }));
      return { success: true, msg: 'অ্যাডমিন লগইন সফল!' };
    }
    const user = state.users.find(u => (u.phone === identifier || u.email === identifier) && u.password === password);
    if (user) {
      localStorage.setItem('ff_user', JSON.stringify(user));
      setState(prev => ({ ...prev, currentUser: user }));
      return { success: true, msg: 'লগইন সফল হয়েছে' };
    }
    return { success: false, msg: 'ভুল আইডি বা পাসওয়ার্ড!' };
  };

  const register = (newUser: any) => {
    const exists = state.users.some(u => u.phone === newUser.phone);
    if (exists) return { success: false, msg: 'এই নাম্বার দিয়ে আইডি আছে' };
    const fullUser: User = { ...newUser, balance: 0, role: 'PLAYER', joinedMatches: [] };
    set(ref(db, 'users/' + fullUser.id), fullUser);
    localStorage.setItem('ff_user', JSON.stringify(fullUser));
    setState(prev => ({ ...prev, currentUser: fullUser }));
    return { success: true, msg: 'রেজিস্ট্রেশন সফল হয়েছে' };
  };

  const logout = () => { localStorage.removeItem('ff_user'); setState(prev => ({ ...prev, currentUser: null })); };
  
  const updateProfile = (updatedUser: Partial<User>) => { 
    if (!state.currentUser) return; 
    update(ref(db, 'users/' + state.currentUser.id), updatedUser); 
  };

  const adminUpdateUser = (userId: string, updates: any) => { 
    if (updates.balance !== undefined) updates.balance = Number(updates.balance);
    update(ref(db, 'users/' + userId), updates); 
  };

  const addTournament = (t: Tournament) => set(ref(db, 'tournaments/' + t.id), t);
  const removeTournament = (id: string) => remove(ref(db, 'tournaments/' + id));
  const updateTournament = (updated: Tournament) => update(ref(db, 'tournaments/' + updated.id), updated);
  
  const addPaymentRequest = (p: PaymentRequest) => set(ref(db, 'payments/' + p.id), p);

  const processPayment = (id: string, status: 'APPROVED' | 'REJECTED') => {
    const payment = state.payments.find(p => p.id === id);
    if (!payment || payment.status !== 'PENDING') return;
    const user = state.users.find(u => u.id === payment.userId);
    if (!user) return;
    
    const updates: any = {};
    updates[`payments/${id}/status`] = status;
    if (status === 'APPROVED') {
      const currentBal = Number(user.balance || 0);
      const amount = Number(payment.amount || 0);
      updates[`users/${user.id}/balance`] = payment.type === 'DEPOSIT' ? currentBal + amount : currentBal - amount;
    }
    update(ref(db), updates);
  };

  const joinTournament = (tournamentId: string, playerNames: string[], type: string, fee: number) => {
    if (!state.currentUser) return { success: false, msg: 'লগইন করুন' };
    const user = state.users.find(u => u.id === state.currentUser?.id);
    const tournament = state.tournaments.find(t => t.id === tournamentId);
    if (!user || Number(user.balance || 0) < fee) return { success: false, msg: 'পর্যাপ্ত ব্যালেন্স নেই' };
    if (!tournament) return { success: false, msg: 'ম্যাচ পাওয়া যায়নি' };
    
    const newPlayer = { userId: user.id, names: playerNames, matchType: type as any, entryPaid: fee };
    const updates: any = {};
    const players = tournament.players || [];
    updates[`tournaments/${tournamentId}/players/${players.length}`] = newPlayer;
    updates[`users/${user.id}/balance`] = Number(user.balance || 0) - fee;
    update(ref(db), updates);
    return { success: true, msg: 'জয়েন করা সফল হয়েছে' };
  };

  const setSettings = (s: AppSettings) => set(ref(db, 'settings'), s);

  const sendMessage = (msg: string, receiverId: string) => {
    if (!state.currentUser) return;
    const msgId = push(ref(db, 'messages')).key;
    const newMsg: ChatMessage = { 
        id: msgId!, 
        senderId: state.currentUser.id, 
        receiverId, 
        message: msg, 
        timestamp: Date.now() 
    };
    set(ref(db, 'messages/' + msgId), newMsg);
  };

  return React.createElement(StoreContext.Provider, {
    value: { 
        ...state, 
        login, register, logout, 
        updateProfile, adminUpdateUser, 
        addTournament, removeTournament, updateTournament, 
        addPaymentRequest, processPayment, 
        joinTournament, setSettings, sendMessage 
    }
  }, children);
};

export const useStore = () => {
  const context = useContext(StoreContext);
  if (!context) throw new Error('useStore must be used within a StoreProvider');
  return context;
};
