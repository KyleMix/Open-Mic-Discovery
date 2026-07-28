import type { Session } from '@supabase/supabase-js';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

import { getSupabase } from '@/lib/supabase';

type SessionState = {
  session: Session | null;
  /** False until the persisted session has been restored from storage. */
  ready: boolean;
};

const SessionContext = createContext<SessionState>({ session: null, ready: false });

export function SessionProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<SessionState>({ session: null, ready: false });

  useEffect(() => {
    const supabase = getSupabase();
    let mounted = true;
    supabase.auth.getSession().then(({ data }) => {
      if (mounted) {
        setState({ session: data.session, ready: true });
      }
    });
    const { data: subscription } = supabase.auth.onAuthStateChange((_event, session) => {
      setState({ session, ready: true });
    });
    return () => {
      mounted = false;
      subscription.subscription.unsubscribe();
    };
  }, []);

  return <SessionContext.Provider value={state}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionState {
  return useContext(SessionContext);
}
