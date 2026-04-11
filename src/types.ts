export interface User {
  id: string;
  email: string;
  displayName?: string;
  photoURL?: string;
  selectedPack?: 'FREE' | 'INITIAL' | 'EXTRA' | 'SUR_MESURE';
  lastBotCreatedAt?: any;
  discordId?: string;
  discordUsername?: string;
  discordLinked?: boolean;
}

export interface Bot {
  id: string;
  userId: string;
  name: string;
  description: string;
  language: 'javascript' | 'python';
  code: string; // This will store the commands.js or the main logic
  status: 'online' | 'offline';
  created_at: any;
  token?: string;
  architecture?: {
    main: string;
    package: string;
    env: string;
  };
}

export type View = 'landing' | 'dashboard' | 'generator' | 'editor' | 'docs' | 'login' | 'signup' | 'offres' | 'select-pack' | 'staff-login' | 'staff-dashboard';
