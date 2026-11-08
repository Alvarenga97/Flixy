import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from "react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import type { Profile } from "@/lib/sorteio";
import { getLocalProfile, saveLocalProfile, getAnonHistory, addAnonHistory, clearAnonHistory, type HistoryItem } from "@/lib/storage";
import { addMyHistory, saveMyProfile, syncMyData } from "@/lib/app-data.functions";

interface AppCtx {
  ready: boolean;
  user: User | null;
  profile: Profile | null;
  saveProfile: (p: Omit<Profile, "version" | "updatedAt">) => Promise<void>;
  history: HistoryItem[];
  addHistory: (h: HistoryItem) => Promise<void>;
  signOut: () => Promise<void>;
}

// Keep a single context instance across hot reloads so provider and consumers always match.
const g = globalThis as unknown as { __cineSorteCtx?: React.Context<AppCtx | null> };
const Ctx = (g.__cineSorteCtx ??= createContext<AppCtx | null>(null));

export function AppProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);

  const syncForUser = useCallback(async (u: User | null) => {
    const local = getLocalProfile();
    if (!u) {
      setProfile(local);
      setHistory(getAnonHistory());
      return;
    }
    const anonymousHistory = getAnonHistory();
    const synced = await syncMyData({ data: { localProfile: local, anonymousHistory } });
    if (anonymousHistory.length) clearAnonHistory();
    if (synced.profile) saveLocalProfile(synced.profile);
    setProfile(synced.profile);
    setHistory(synced.history);
  }, []);

  useEffect(() => {
    let active = true;
    const backendReady = Boolean(import.meta.env["VITE_SUPABASE_URL"] && import.meta.env["VITE_SUPABASE_PUBLISHABLE_KEY"]);
    if (!backendReady) {
      setProfile(getLocalProfile());
      setHistory(getAnonHistory());
      setReady(true);
      return;
    }
    supabase.auth.getUser()
      .then(async ({ data }) => {
        if (!active) return;
        setUser(data.user);
        await syncForUser(data.user);
      })
      .catch(() => {
        setProfile(getLocalProfile());
        setHistory(getAnonHistory());
      })
      .finally(() => active && setReady(true));
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event !== "SIGNED_IN" && event !== "SIGNED_OUT") return;
      const u = session?.user ?? null;
      setUser(u);
      setTimeout(() => void syncForUser(u).catch(() => {
        setProfile(getLocalProfile());
        setHistory(getAnonHistory());
      }), 0);
    });
    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, [syncForUser]);

  const saveProfile: AppCtx["saveProfile"] = async (p) => {
    const full: Profile = { ...p, version: 1, updatedAt: new Date().toISOString() };
    if (user) await saveMyProfile({ data: full });
    saveLocalProfile(full);
    setProfile(full);
  };

  const addHistory: AppCtx["addHistory"] = async (h) => {
    if (user) await addMyHistory({ data: h });
    else addAnonHistory(h);
    setHistory((prev) => [h, ...prev]);
  };

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  return <Ctx.Provider value={{ ready, user, profile, saveProfile, history, addHistory, signOut }}>{children}</Ctx.Provider>;
}

export function useApp() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useApp fora do AppProvider");
  return c;
}
