import React, { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Bot as BotIcon, 
  Terminal, 
  Cpu, 
  Download, 
  Play, 
  Square, 
  Plus, 
  Settings, 
  LogOut, 
  ChevronRight, 
  Code, 
  Book, 
  Layout, 
  Sparkles,
  Key,
  Rocket,
  Github,
  MessageSquare,
  Shield,
  Zap,
  Trash2,
  Save,
  Copy,
  Check,
  Ticket,
  TrendingUp,
  Award,
  Activity,
  Star,
  AlertTriangle,
  Lightbulb,
  Globe,
  ExternalLink,
  Server,
  SlidersHorizontal,
  Filter,
  Search,
  Database,
  Bell,
  Hexagon,
  Trophy,
  List,
  EyeOff,
  Lock,
  ScrollText,
  ArrowLeft,
  Send,
  Volume2,
  VolumeX
} from 'lucide-react';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { generateBotCode } from './services/geminiService';
import { User, Bot, View } from './types';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import TechBackground from './components/TechBackground';
import JSZip from 'jszip';

// Firebase
import { auth, db, googleProvider } from './firebase';
import { 
  signInWithPopup, 
  onAuthStateChanged, 
  signOut, 
  createUserWithEmailAndPassword, 
  signInWithEmailAndPassword,
  signInAnonymously
} from 'firebase/auth';
import { 
  collection, 
  query, 
  where, 
  getDocs, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  doc, 
  orderBy,
  Timestamp,
  getDoc,
  setDoc,
  onSnapshot
} from 'firebase/firestore';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId: string | undefined;
    email: string | null | undefined;
    emailVerified: boolean | undefined;
    isAnonymous: boolean | undefined;
    tenantId: string | null | undefined;
    providerInfo: {
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }[];
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData.map(provider => ({
        providerId: provider.providerId,
        displayName: provider.displayName,
        email: provider.email,
        photoUrl: provider.photoURL
      })) || []
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export default function App() {
  const [view, setView] = useState<View>('landing');
  const [user, setUser] = useState<User | null>(null);
  const [bots, setBots] = useState<Bot[]>([]);
  const [currentBot, setCurrentBot] = useState<Bot | null>(null);
  const [loading, setLoading] = useState(false);
  const [prompt, setPrompt] = useState('');
  const [token, setToken] = useState('');
  const [selectedPack, setSelectedPack] = useState<'FREE' | 'EXTRA' | 'SUR_MESURE' | null>(null);
  const [language, setLanguage] = useState<'javascript' | 'python'>('javascript');
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authError, setAuthError] = useState('');
  const [copied, setCopied] = useState(false);
  const [staffCode, setStaffCode] = useState('');
  const [botLogs, setBotLogs] = useState<string[]>([]);
  const [isBooting, setIsBooting] = useState(false);
  const [pendingOrders, setPendingOrders] = useState<any[]>([]);
  const [discordUser, setDiscordUser] = useState<any>(null);
  const [isStaff, setIsStaff] = useState(false);
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);
  const [isMuted, setIsMuted] = useState(true);
  const audioRef = useRef<HTMLAudioElement>(null);

  const fetchOrders = useCallback(() => {
    const q = query(collection(db, 'orders'), orderBy('date', 'desc'));
    return onSnapshot(q, (snapshot) => {
      const orders = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setPendingOrders(orders);
    }, (error) => {
      console.error("Error fetching orders:", error);
    });
  }, []);

  useEffect(() => {
    if (isStaff) {
      const unsubscribe = fetchOrders();
      return () => unsubscribe();
    }
  }, [isStaff, fetchOrders]);

  const [genError, setGenError] = useState<string | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [activeFile, setActiveFile] = useState<'commands' | 'main' | 'package' | 'env'>('commands');
  const [zipProgress, setZipProgress] = useState(0);
  const [zipStatus, setZipStatus] = useState('');
  const [isZipping, setIsZipping] = useState(false);

  const fetchBots = useCallback(async (userId: string) => {
    if (!userId) return;
    try {
      const q = query(
        collection(db, 'bots'), 
        where('userId', '==', userId)
      );
      const querySnapshot = await getDocs(q);
      const botsData = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as any[];
      setBots(botsData);
    } catch (e) {
      handleFirestoreError(e, OperationType.LIST, 'bots');
    }
  }, []);

  useEffect(() => {
    // Check for Discord session in localStorage on load
    const savedDiscordUser = localStorage.getItem('discord_session');
    if (savedDiscordUser && !user) {
      const payload = JSON.parse(savedDiscordUser);
      setDiscordUser(payload);
      
      const virtualUser: User = {
        id: `discord_${payload.id}`,
        email: payload.email || `${payload.username}@discord.com`,
        displayName: payload.username,
        photoURL: payload.avatar ? `https://cdn.discordapp.com/avatars/${payload.id}/${payload.avatar}.png` : '',
        discordId: payload.id,
        discordUsername: payload.username,
        discordLinked: true
      };
      setUser(virtualUser);
      fetchBots(virtualUser.id);
      if (view === 'login' || view === 'signup' || view === 'landing') {
        setView('dashboard');
      }
    }

    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        // Fetch user data from Firestore
        const userDoc = await getDoc(doc(db, 'users', firebaseUser.uid));
        const userData = userDoc.data();

        const u = {
          id: firebaseUser.uid,
          email: firebaseUser.email || '',
          displayName: firebaseUser.displayName || '',
          photoURL: firebaseUser.photoURL || '',
          selectedPack: userData?.selectedPack,
          lastBotCreatedAt: userData?.lastBotCreatedAt
        };
        setUser(u as any);
        if (userData?.selectedPack) {
          setSelectedPack(userData.selectedPack);
        }
        await fetchBots(firebaseUser.uid);
        if (view === 'login' || view === 'signup') {
          setView('dashboard');
        }
      } else {
        // CRITICAL: Only clear user if there is no Discord session
        if (!localStorage.getItem('discord_session')) {
          setUser(null);
          setSelectedPack(null);
          setIsStaff(false);
          if (view === 'dashboard' || view === 'generator' || view === 'editor') {
            setView('landing');
          }
        }
      }
      setIsAuthReady(true);
    });
    return () => unsubscribe();
  }, [fetchBots, view]);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = 0.3;
      if (!isMuted) {
        audioRef.current.play().catch(e => console.log("Audio play blocked", e));
      } else {
        audioRef.current.pause();
      }
    }
  }, [isMuted]);

  useEffect(() => {
    const pollInterval = setInterval(() => {
      const authResult = localStorage.getItem('discord_auth_result');
      if (authResult) {
        try {
          const { timestamp, payload } = JSON.parse(authResult);
          // Only process if it's fresh (last 30 seconds)
          if (Date.now() - timestamp < 30000) {
            console.log("[OAuth] Auth result found in localStorage, processing...");
            localStorage.removeItem('discord_auth_result');
            
            // Trigger the same logic as message event
            window.postMessage({ type: 'OAUTH_AUTH_SUCCESS', payload }, window.location.origin);
          }
        } catch (e) {
          console.error("Failed to parse auth result from localStorage", e);
        }
      }
    }, 1000);

    return () => clearInterval(pollInterval);
  }, []);

  useEffect(() => {
    const handleMessage = async (event: MessageEvent) => {
      // Relaxed origin check for preview environments
      const origin = event.origin;
      const isAllowedOrigin = origin.endsWith('.run.app') || origin.includes('localhost') || origin.includes('google.com');
      if (!isAllowedOrigin) return;

      if (event.data?.type === 'OAUTH_AUTH_SUCCESS') {
        console.log("[OAuth] Success message received from popup", event.data.payload);
        const payload = event.data.payload;
        setDiscordUser(payload);
        
        const virtualId = `discord_${payload.id}`;
        console.log("[OAuth] Virtual ID generated:", virtualId);
        const userData = {
          uid: virtualId,
          email: payload.email || `${payload.username}@discord.com`,
          displayName: payload.username,
          photoURL: payload.avatar ? `https://cdn.discordapp.com/avatars/${payload.id}/${payload.avatar}.png` : '',
          discordId: payload.id,
          discordUsername: payload.username,
          discordAvatar: payload.avatar,
          discordLinked: true,
          lastLogin: Timestamp.now()
        };

        // Persist session immediately
        localStorage.setItem('discord_session', JSON.stringify(payload));

        if (user) {
          console.log("[OAuth] Linking Discord to existing user:", user.id);
          try {
            await updateDoc(doc(db, 'users', user.id), {
              discordId: payload.id,
              discordUsername: payload.username,
              discordAvatar: payload.avatar,
              discordLinked: true
            });
            setUser(prev => prev ? { ...prev, discordId: payload.id, discordUsername: payload.username } : null);
            alert(`Compte Discord @${payload.username} lié avec succès !`);
          } catch (e) {
            console.error("[OAuth] Failed to link Discord", e);
          }
        } else {
          console.log("[OAuth] Performing Discord Login for:", virtualId);
          try {
            let userDoc;
            try {
              userDoc = await getDoc(doc(db, 'users', virtualId));
            } catch (getErr: any) {
              console.error("[OAuth] Failed to fetch user profile document", getErr);
              throw new Error(`Erreur récupération profil: ${getErr.message}`);
            }
            const finalUserData = {
              uid: virtualId,
              email: userData.email,
              displayName: userData.displayName,
              photoURL: userData.photoURL,
              discordId: userData.discordId,
              discordUsername: userData.discordUsername,
              discordLinked: true
            };

            try {
              await setDoc(doc(db, 'users', virtualId), {
                ...finalUserData,
                created_at: userDoc.exists() ? (userDoc.data() as any).created_at : Timestamp.now()
              }, { merge: true });
            } catch (setErr: any) {
              console.error("[OAuth] Failed to update user profile document", setErr);
              throw new Error(`Erreur mise à jour profil: ${setErr.message}`);
            }

            const loggedUser: User = {
              id: virtualId,
              email: userData.email,
              displayName: userData.displayName,
              photoURL: userData.photoURL,
              discordId: payload.id,
              discordUsername: payload.username,
              discordLinked: true
            };

            console.log("[OAuth] Login successful, fetching bots for:", virtualId);
            try {
              await fetchBots(virtualId);
            } catch (fetchErr) {
              console.error("[OAuth] Failed to fetch bots during login", fetchErr);
              // Don't block login if fetchBots fails, just log it
            }
            console.log("[OAuth] Redirecting to dashboard");
            setView('dashboard');
          } catch (e: any) {
            console.error("[OAuth] Discord login failed", e);
            setAuthError(`Erreur profil Discord: ${e.message || "Erreur inconnue"}`);
          }
        }
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [user, fetchBots]); // Added fetchBots to dependencies

  const handleDiscordLogin = async () => {
    try {
      const response = await fetch('/api/auth/discord/url');
      if (!response.ok) throw new Error('Failed to get auth URL');
      const { url } = await response.json();

      const authWindow = window.open(url, 'discord_oauth', 'width=600,height=700');
      if (!authWindow) alert('Veuillez autoriser les popups pour vous connecter avec Discord.');
    } catch (error) {
      console.error('Discord login error:', error);
      setAuthError("Erreur lors de la connexion avec Discord");
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');
    try {
      await signInWithEmailAndPassword(auth, authEmail, authPassword);
    } catch (e: any) {
      setAuthError("Email ou mot de passe incorrect");
    }
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');
    try {
      const userCredential = await createUserWithEmailAndPassword(auth, authEmail, authPassword);
      const firebaseUser = userCredential.user;
      
      await setDoc(doc(db, 'users', firebaseUser.uid), {
        uid: firebaseUser.uid,
        email: firebaseUser.email,
        displayName: firebaseUser.displayName || '',
        photoURL: firebaseUser.photoURL || '',
        created_at: Timestamp.now()
      });
    } catch (e: any) {
      setAuthError(e.message || "Erreur d'inscription");
    }
  };

  const handleGoogleLogin = async () => {
    setAuthError('');
    try {
      const result = await signInWithPopup(auth, googleProvider);
      const firebaseUser = result.user;
      
      const userDoc = await getDoc(doc(db, 'users', firebaseUser.uid));
      if (!userDoc.exists()) {
        await setDoc(doc(db, 'users', firebaseUser.uid), {
          uid: firebaseUser.uid,
          email: firebaseUser.email,
          displayName: firebaseUser.displayName || '',
          photoURL: firebaseUser.photoURL || '',
          created_at: Timestamp.now()
        });
      }
    } catch (e: any) {
      setAuthError("Erreur de connexion Google");
    }
  };

  useEffect(() => {
    if (selectedPack === 'EXTRA') {
      setPrompt("Pack EXTRA activé : Ce bot inclut automatiquement les systèmes de Tickets (Modal), Créateur d'Embed (Modal), Modération complète, Logs automatiques, Bienvenue stylé, Giveaways et Reaction-Roles.");
    } else if (selectedPack === 'FREE') {
      setPrompt("Pack FREE : Bot de modération et d'information basique.");
    }
  }, [selectedPack]);

  useEffect(() => {
    if (selectedPack === 'EXTRA') {
      setPrompt("Pack EXTRA activé : Ce bot inclut automatiquement les systèmes de Tickets (Modal), Créateur d'Embed (Modal), Modération complète, Logs automatiques, Bienvenue stylé, Giveaways et Reaction-Roles.");
    } else if (selectedPack === 'FREE') {
      setPrompt("Pack FREE : Configuration automatique (10 commandes incluses). La description est ignorée.");
    }
  }, [selectedPack]);

  const handleLogout = async () => {
    try {
      await signOut(auth);
      localStorage.removeItem('discord_session');
      setDiscordUser(null);
      setUser(null);
      setIsStaff(false);
      setView('landing');
    } catch (e) {
      console.error("Logout failed", e);
    }
  };

  const handleNewBot = () => {
    if (!user) return;
    
    if (!user.selectedPack) {
      setView('select-pack');
      return;
    }

    // Check 2-day limit for FREE pack
    if (user.selectedPack === 'FREE' && user.lastBotCreatedAt) {
      const lastCreated = user.lastBotCreatedAt.toDate ? user.lastBotCreatedAt.toDate() : new Date(user.lastBotCreatedAt);
      const now = new Date();
      const diffTime = Math.abs(now.getTime() - lastCreated.getTime());
      const diffDays = diffTime / (1000 * 60 * 60 * 24);
      
      if (diffDays < 2) {
        alert("Pack FREE : Vous ne pouvez créer qu'un seul bot tous les 2 jours. Veuillez patienter ou passer au Pack Premium !");
        return;
      }
    }

    setView('generator');
  };

  const handleGenerate = async () => {
    if (!user) {
      setView('login');
      return;
    }

    if (selectedPack === 'FREE') {
      const twoDaysAgo = new Date();
      twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);
      
      const recentBot = bots.find(b => {
        const createdAt = b.created_at instanceof Timestamp ? b.created_at.toDate() : new Date(b.created_at);
        return createdAt > twoDaysAgo;
      });
      
      if (recentBot) {
        setGenError("Limite du Pack FREE : Vous ne pouvez créer qu'un seul bot tous les 2 jours. Veuillez patienter ou passer à un pack supérieur.");
        return;
      }
    }

    setGenError(null);
    setLoading(true);
    try {
      const responseText = await generateBotCode(prompt, language, token, selectedPack || 'FREE');
      let botArchitecture;
      try {
        botArchitecture = JSON.parse(responseText);
      } catch (e) {
        // Fallback if AI doesn't return valid JSON
        botArchitecture = {
          main: language === 'javascript' ? "const { Client } = require('discord.js');\nconst client = new Client({ intents: [] });\nclient.login(process.env.TOKEN);" : "import discord\nclient = discord.Client()\nclient.run(os.getenv('TOKEN'))",
          package: language === 'javascript' ? "{\n  \"dependencies\": {\n    \"discord.js\": \"^14.0.0\",\n    \"dotenv\": \"^16.0.0\"\n  }\n}" : "discord.py\npython-dotenv",
          commands: responseText,
          env: "TOKEN=your_token_here"
        };
      }

      const botName = selectedPack === 'FREE' ? "Bot FREE Automatique" : (prompt.split(' ').slice(0, 3).join(' ') || "Nouveau Bot");
      
      const botData = {
        userId: user.id,
        name: botName,
        description: prompt,
        language,
        code: botArchitecture.commands || responseText,
        status: 'offline',
        created_at: Timestamp.now(),
        token: token,
        architecture: {
          main: botArchitecture.main,
          package: botArchitecture.package,
          env: botArchitecture.env
        }
      };

      const now = Timestamp.now();
      let docRef;
      try {
        docRef = await addDoc(collection(db, 'bots'), botData);
      } catch (e) {
        handleFirestoreError(e, OperationType.CREATE, 'bots');
      }
      
      // Update user's last creation date
      try {
        await updateDoc(doc(db, 'users', user.id), {
          lastBotCreatedAt: now
        });
      } catch (e) {
        handleFirestoreError(e, OperationType.UPDATE, `users/${user.id}`);
      }
      setUser(prev => prev ? { ...prev, lastBotCreatedAt: now } : null);

      await fetchBots(user.id);
      
      setCurrentBot({ id: docRef.id, ...botData } as any);
      setView('editor');
    } catch (e) {
      console.error("Generation failed", e);
      setGenError("Erreur lors de la génération du bot.");
    } finally {
      setLoading(false);
    }
  };

  const toggleBotStatus = async (bot: Bot) => {
    const isTurningOn = bot.status === 'offline';
    
    if (isTurningOn) {
      if (!bot.token) {
        alert("Veuillez configurer le TOKEN du bot avant de le lancer.");
        return;
      }

      setIsZipping(true);
      setZipProgress(0);
      setZipStatus("Injection du Token...");
      
      setIsBooting(true);
      setBotLogs([`[SYSTEM] Initialisation de ${bot.name}...`]);
      
      const startupLogs = [
        `[STEP] Injection du Token...`,
        `[STEP] Génération du package.json...`,
        `[STEP] Installation de ${bot.language === 'javascript' ? 'discord.js' : 'discord.py'}...`,
        `[STEP] Liaison du script ${bot.name.replace(/\s+/g, '_')}...`,
        `[INFO] Chargement des modules ${bot.language}...`,
        `[INFO] Connexion aux serveurs Discord...`,
        `[SUCCESS] Authentifié en tant que ${bot.name}#0001`,
        `[INFO] ${bot.language === 'javascript' ? 'discord.js' : 'discord.py'} v14.0.0 prêt.`,
        `[READY] Prêt ! Le bot est maintenant en ligne.`
      ];

      for (let i = 0; i < startupLogs.length; i++) {
        if (i === 1) { setZipProgress(40); setZipStatus("Compilation du ZIP..."); }
        if (i === 7) { setZipProgress(100); setZipStatus("Prêt !"); }
        
        await new Promise(resolve => setTimeout(resolve, 600 + Math.random() * 800));
        setBotLogs(prev => [...prev, startupLogs[i]]);
      }
      setIsBooting(false);
      setTimeout(() => setIsZipping(false), 1000);
    } else {
      setBotLogs(prev => [...prev, `[SYSTEM] Arrêt du bot...`, `[OFFLINE] Bot déconnecté.`]);
    }

    const newStatus = isTurningOn ? 'online' : 'offline';
    try {
      const botRef = doc(db, 'bots', bot.id as string);
      await updateDoc(botRef, { status: newStatus });
      await fetchBots(user!.id);
      if (currentBot?.id === bot.id) {
        setCurrentBot({ ...currentBot, status: newStatus });
      }
    } catch (e) {
      console.error("Failed to update status", e);
    }
  };

  // Force offline when user leaves or logs out
  useEffect(() => {
    if (!user) {
      // If user logs out, we can't easily update Firestore for all bots here without a batch
      // but we can at least clear local state
      setBotLogs([]);
      return;
    }

    const handleBeforeUnload = () => {
      // This is a bit aggressive but ensures "online only when connected"
      // In a real app, we'd use Firestore presence
      bots.forEach(async (bot) => {
        if (bot.status === 'online') {
          const botRef = doc(db, 'bots', bot.id);
          await updateDoc(botRef, { status: 'offline' });
        }
      });
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [user, bots]);

  const saveBotCode = async () => {
    if (!currentBot) return;
    try {
      const botRef = doc(db, 'bots', currentBot.id as string);
      await updateDoc(botRef, { 
        code: currentBot.code,
        token: currentBot.token || ''
      });
      await fetchBots(user!.id);
      alert("Configuration sauvegardée !");
    } catch (e) {
      console.error("Failed to save code", e);
    }
  };

  const deleteBot = async (id: string) => {
    console.log("[Bot] Attempting to delete bot:", id);
    // confirm() can be blocked in iframes, so we'll just proceed or use a custom UI later
    try {
      await deleteDoc(doc(db, 'bots', id));
      if (user) {
        await fetchBots(user.id);
      }
      if (currentBot?.id === id) setView('dashboard');
    } catch (e) {
      handleFirestoreError(e, OperationType.DELETE, `bots/${id}`);
    }
  };

  const downloadCode = () => {
    if (!currentBot) return;
    const blob = new Blob([currentBot.code], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${currentBot.name.replace(/\s+/g, '_')}.${currentBot.language === 'javascript' ? 'js' : 'py'}`;
    a.click();
  };

  const downloadZip = async () => {
    if (!currentBot) return;
    
    setIsZipping(true);
    setZipProgress(0);
    setZipStatus("Injection du Token...");
    
    await new Promise(resolve => setTimeout(resolve, 800));
    setZipProgress(40);
    setZipStatus("Compilation du ZIP...");
    
    const zip = new JSZip();
    const isJS = currentBot.language === 'javascript';
    
    // Templates robustes pour éviter les fichiers vides
    const defaultJSMain = `const { Client, GatewayIntentBits, Collection } = require('discord.js');
const fs = require('fs');
const path = require('path');

const TOKEN = "VOTRE_TOKEN_ICI";

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildMembers
    ]
});

client.commands = new Collection();
const commandsPath = __dirname;

// Chargement automatique des commandes
if (fs.existsSync(commandsPath)) {
    const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js') && file !== 'index.js' && file !== 'deploy-commands.js');
    for (const file of commandFiles) {
        const filePath = path.join(commandsPath, file);
        try {
            const command = require(filePath);
            if (command.data && command.execute) {
                client.commands.set(command.data.name, command);
            }
        } catch (error) {
            console.error(\`Erreur lors du chargement de \${file}: \`, error);
        }
    }
}

client.once('ready', () => {
    console.log('Bot en ligne ! Authentifié en tant que ' + client.user.tag);
});

client.login(TOKEN);`;

    const defaultJSPackage = `{
  "name": "discord-bot-custom",
  "version": "1.0.0",
  "description": "Bot Discord généré par DiscordBot IA",
  "main": "index.js",
  "scripts": {
    "start": "node deploy-commands.js && node index.js"
  },
  "dependencies": {
    "discord.js": "latest",
    "@discordjs/rest": "latest"
  }
}`;

    const defaultJSDeploy = `const { REST, Routes } = require('discord.js');
const fs = require('fs');
const path = require('path');

const TOKEN = "VOTRE_TOKEN_ICI";

const commands = [];
const commandsPath = __dirname;

if (fs.existsSync(commandsPath)) {
    const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js') && file !== 'index.js' && file !== 'deploy-commands.js');
    for (const file of commandFiles) {
        const filePath = path.join(commandsPath, file);
        const command = require(filePath);
        if (command.data) {
            commands.push(command.data.toJSON());
        }
    }
}

const rest = new REST({ version: '10' }).setToken(TOKEN);

(async () => {
    try {
        console.log(\`Début du rafraîchissement de \${commands.length} commandes Slash...\`);

        // On récupère l'ID du client à partir du token (partie avant le premier point)
        const clientId = Buffer.from(TOKEN.split('.')[0], 'base64').toString();

        await rest.put(
            Routes.applicationCommands(clientId),
            { body: commands },
        );

        console.log('Commandes Slash enregistrées avec succès !');
    } catch (error) {
        console.error('Erreur lors du déploiement des commandes:', error);
    }
})();`;

    const defaultPyMain = `import discord
import sys
import os
from discord.ext import commands

TOKEN = "VOTRE_TOKEN_ICI"

intents = discord.Intents.default()
intents.message_content = True
intents.members = True

bot = commands.Bot(command_prefix='!', intents=intents)

@bot.event
async def on_ready():
    print(f'Bot en ligne ! Connecté en tant que {bot.user}')
    # Chargement automatique des commandes à la racine
    for filename in os.listdir('.'):
        if filename.endswith('.py') and filename not in ['main.py']:
            try:
                await bot.load_extension(filename[:-3])
                print(f'Chargé: {filename}')
            except Exception as e:
                print(f'Erreur sur {filename}: {e}')

bot.run(TOKEN)`;

    const defaultPyReqs = `discord.py>=2.0.0`;

    const mainFile = isJS ? 'index.js' : 'main.py';
    const packageFile = isJS ? 'package.json' : 'requirements.txt';
    const cmdFileName = isJS ? 'Modération_Tickets_Musique.js' : 'moderation_tickets_musique.py';

    const cleanToken = (currentBot.token || 'VOTRE_TOKEN_ICI').trim();
    
    // Préparation du code principal avec le token en dur
    let mainCode = currentBot.architecture?.main || (isJS ? defaultJSMain : defaultPyMain);
    mainCode = mainCode.replace(/process\.env\.TOKEN/g, `"${cleanToken}"`)
                      .replace(/os\.getenv\(['"]TOKEN['"]\)/g, `"${cleanToken}"`)
                      .replace(/VOTRE_TOKEN_ICI/g, cleanToken);
    
    // Préparation du package/requirements sans dotenv
    let packageCode = currentBot.architecture?.package || (isJS ? defaultJSPackage : defaultPyReqs);
    packageCode = packageCode.replace(/"dotenv":\s*"[^"]*",?\n?/g, "")
                            .replace(/python-dotenv>=[^ \n]*/g, "");

    // Ajout des fichiers à la racine
    zip.file(mainFile, mainCode);
    zip.file(packageFile, packageCode);
    
    if (isJS) {
      let deployCode = defaultJSDeploy.replace(/process\.env\.TOKEN/g, `"${cleanToken}"`)
                                     .replace(/VOTRE_TOKEN_ICI/g, cleanToken);
      zip.file('deploy-commands.js', deployCode);
    }
    
    // Ajout du script de commandes dans le dossier commands/ (Katabump stability)
    zip.folder('commands').file(cmdFileName, currentBot.code);

    await new Promise(resolve => setTimeout(resolve, 1000));
    setZipProgress(90);
    setZipStatus("Prêt !");

    const content = await zip.generateAsync({ type: "blob" });
    const url = URL.createObjectURL(content);
    const a = document.createElement('a');
    a.href = url;
    a.download = `DiscordBot_${currentBot.name.replace(/\s+/g, '_')}.zip`;
    a.click();
    
    setTimeout(() => {
      setIsZipping(false);
      setZipProgress(0);
    }, 1500);
  };

  const copyToClipboard = () => {
    if (!currentBot) return;
    navigator.clipboard.writeText(currentBot.code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // --- Components ---

  const Navbar = () => (
    <nav className="fixed top-0 left-0 right-0 z-50 px-8 py-4 backdrop-blur-xl bg-black/40 border-b border-white/5 flex items-center justify-between">
      <div className="flex items-center gap-4 cursor-pointer group" onClick={() => setView('landing')}>
        <div className="w-12 h-12 bg-gradient-to-br from-indigo-600 to-purple-700 rounded-xl flex items-center justify-center shadow-[0_0_20px_rgba(139,92,246,0.3)] group-hover:scale-110 transition-all border border-white/10">
          <BotIcon className="text-white drop-shadow-[0_0_8px_rgba(255,255,255,0.6)]" size={24} />
        </div>
        <div className="flex flex-col -space-y-1">
          <span className="font-display font-bold text-2xl tracking-tighter bg-gradient-to-r from-white to-white/60 bg-clip-text text-transparent italic pr-3 whitespace-nowrap">DiscordBot AI</span>
          <div className="h-0.5 w-full bg-cyan-400 shadow-[0_0_5px_rgba(34,211,238,0.8)] opacity-0 group-hover:opacity-100 transition-opacity" />
        </div>
      </div>
      
      <div className="hidden lg:flex items-center gap-10 text-[13px] font-medium transition-all">
        {[
          { id: 'landing', label: 'Accueil' },
          { id: 'offres', label: 'Nos Offres' },
          { id: 'docs', label: 'Documentation' },
          { id: 'host-selection', label: 'Hébergeurs' },
          { id: 'dashboard', label: 'Tableau de bord', protected: true },
          { id: 'member-support', label: 'Support', protected: true },
          { id: 'staff-dashboard', label: 'Staff Dashboard', isStaffLink: true },
        ].map((item) => (
          ((item.protected ? !!user : true) && (item.isStaffLink ? !!isStaff : true)) && (
            <button 
              key={item.id}
              onClick={() => setView(item.id as View)} 
              className={cn(
                "relative py-2 transition-all duration-300",
                view === item.id ? "text-cyan-400" : "text-white/40 hover:text-white"
              )}
            >
              {item.label}
              {view === item.id && (
                <motion.div 
                  layoutId="nav-underline"
                  className="absolute bottom-0 left-0 right-0 h-[3px] bg-cyan-400 shadow-[0_0_12px_rgba(34,211,238,0.9)] rounded-full"
                />
              )}
            </button>
          )
        ))}
      </div>

      <div className="flex items-center gap-3 sm:gap-6">
        {/* Audio Control Interface */}
        <motion.button 
          onClick={() => setIsMuted(!isMuted)}
          whileTap={{ scale: 0.98 }}
          className={cn(
            "h-10 px-4 bg-black border border-white/5 transition-all flex items-center gap-4 group relative overflow-hidden",
            "hover:border-white/20 active:shadow-[0_0_15px_rgba(255,255,255,0.15)]"
          )}
        >
          {/* Status Label */}
          <div className="flex flex-col items-start min-w-[60px]">
            <span className="text-[7px] font-black tracking-[0.2em] text-white/20 uppercase leading-none mb-1">Status</span>
            <span className={cn(
              "text-[9px] font-bold tracking-widest uppercase transition-colors duration-500",
              isMuted ? "text-white/30" : "text-white"
            )}>
              {isMuted ? 'Sound: Off' : 'Sound: On'}
            </span>
          </div>

          {/* Cinematic Waveform */}
          <div className="flex items-center gap-[2px] h-3">
            {[1.2, 1.8, 1.4, 2.2, 1.6, 1.9, 1.3, 1.7].map((speed, i) => (
              <motion.div 
                key={i}
                animate={!isMuted ? { 
                  height: [4, 12, 4],
                  opacity: [0.3, 1, 0.3]
                } : { 
                  height: 2,
                  opacity: 0.1 
                }}
                transition={!isMuted ? { 
                  repeat: Infinity, 
                  duration: speed, 
                  ease: "easeInOut" 
                } : { duration: 0.5 }}
                className="w-[1.5px] bg-white transition-all duration-500"
              />
            ))}
          </div>

          {/* Interaction Glow Layer */}
          <motion.div 
            initial={false}
            animate={{ opacity: 0 }}
            whileTap={{ opacity: 0.1 }}
            className="absolute inset-0 bg-white pointer-events-none"
          />
        </motion.button>

        {user ? (
          <div className="flex items-center gap-3 sm:gap-6">
            <span className="hidden md:inline text-[10px] font-black text-white/40 uppercase tracking-widest">{user.email}</span>
            <button onClick={handleLogout} className="w-10 h-10 bg-white/5 hover:bg-red-500/10 border border-white/10 rounded-xl transition-all hover:scale-110 group flex items-center justify-center shrink-0" title="Déconnexion">
              <LogOut size={18} className="text-white/40 group-hover:text-red-400 transition-colors" />
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-2 sm:gap-4">
            <button onClick={() => setView('login')} className="px-3 sm:px-5 py-2 text-[13px] font-semibold text-white/50 hover:text-white transition-colors whitespace-nowrap">Connexion</button>
            <button onClick={() => setView('signup')} className="px-5 sm:px-6 py-2.5 bg-indigo-600 hover:bg-indigo-500 rounded-xl text-[13px] font-bold text-white shadow-lg shadow-indigo-600/20 hover:scale-[1.02] transition-all border border-white/10 whitespace-nowrap">S'inscrire</button>
          </div>
        )}
      </div>
    </nav>
  );

  const Landing = () => (
    <div className="pt-20 space-y-32 relative z-10">
      {/* Hero Section */}
      <section className="relative min-h-[90vh] flex flex-col items-center justify-center px-6 overflow-hidden bg-transparent">
        {/* Background Gradients & Grid */}
        <div className="absolute inset-0 z-0 pointer-events-none">
          <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:60px_60px] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_50%,#000_70%,transparent_100%)] opacity-20" />
          <div className="absolute top-1/4 left-1/4 w-[500px] h-[500px] bg-indigo-600/10 blur-[120px] rounded-full animate-pulse" />
          <div className="absolute bottom-1/4 right-1/4 w-[500px] h-[500px] bg-cyan-600/10 blur-[120px] rounded-full animate-pulse delay-700" />
        </div>

        <div className="relative z-10 max-w-7xl mx-auto w-full pt-20 text-center space-y-10">
          <motion.div 
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="inline-flex items-center gap-3 px-6 py-2 rounded-full glass border border-white/10 text-[10px] font-black uppercase tracking-[0.3em] text-white/60 mb-4"
          >
            <Sparkles size={14} className="text-cyan-400" />
            Propulsé par l'IA de pointe
          </motion.div>

          <div className="space-y-6">
            <motion.h1 
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8 }}
              className="text-6xl md:text-8xl font-display font-medium tracking-tighter text-white drop-shadow-[0_10px_30px_rgba(0,0,0,0.5)]"
            >
              Créez votre Bot Discord
            </motion.h1>
            <motion.h2 
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.1 }}
              className="text-5xl md:text-7xl font-display font-bold italic text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 via-blue-500 to-emerald-400"
            >
              sans coder.
            </motion.h2>
          </div>

          <motion.p 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.3 }}
            className="text-white/40 text-lg md:text-xl max-w-3xl mx-auto font-medium leading-relaxed"
          >
            Décrivez vos besoins, notre IA génère le code complet, vous l'hébergez et le gérez en un clic. La création de bots n'a jamais été aussi simple.
          </motion.p>

          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.4 }}
            className="flex flex-col sm:flex-row items-center justify-center gap-6 pt-6"
          >
            <button 
              onClick={() => user ? setView('generator') : setView('signup')}
              className="w-full sm:w-auto px-10 py-5 brushed-metal rounded-2xl font-black text-xs uppercase tracking-[0.25em] text-white shadow-2xl hover:scale-105 active:scale-95 transition-all flex items-center justify-center gap-3 border border-indigo-500/30 group"
            >
              Commencer gratuitement <ChevronRight size={18} className="group-hover:translate-x-1 transition-transform" />
            </button>
            <button 
              onClick={() => setView('docs')} 
              className="w-full sm:w-auto px-10 py-5 glass border border-white/5 rounded-2xl font-black text-xs uppercase tracking-[0.25em] text-white/60 hover:text-white hover:border-cyan-400/30 transition-all flex items-center justify-center gap-3 backdrop-blur-3xl group"
            >
              Voir la documentation <Book size={18} className="group-hover:rotate-12 transition-transform" />
            </button>
          </motion.div>
        </div>
      </section>

      {/* Feature Tiles Grid */}
      <section className="max-w-7xl mx-auto px-6">
        <div className="grid md:grid-cols-3 gap-8">
          {[
            { icon: <Zap size={28} />, title: "Génération Instantanée", desc: "Obtenez un script complet en quelques secondes grâce à Gemini 3.1 Pro.", color: "text-amber-400", bg: "bg-amber-400/10", shadow: "shadow-amber-400/10" },
            { icon: <Shield size={28} />, title: "Sécurisé & Propre", desc: "Le code généré suit les meilleures pratiques de sécurité et de performance.", color: "text-emerald-400", bg: "bg-emerald-400/10", shadow: "shadow-emerald-400/10" },
            { icon: <Cpu size={28} />, title: "Hébergement Intégré", desc: "Lancez votre bot directement depuis notre plateforme sans configuration complexe.", color: "text-purple-400", bg: "bg-purple-400/10", shadow: "shadow-purple-400/10" }
          ].map((feature, i) => (
            <motion.div 
              key={i}
              initial={{ opacity: 0, scale: 0.95 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.1 }}
              className="p-10 rounded-[2.5rem] glass hover:border-white/20 transition-all group relative overflow-hidden h-72 flex flex-col justify-between"
            >
              <div className={cn("w-16 h-16 rounded-2xl flex items-center justify-center transition-transform group-hover:scale-110", feature.bg, feature.color)}>
                {feature.icon}
              </div>
              <div className="space-y-3">
                <h3 className="text-2xl font-display font-bold italic tracking-tight">{feature.title}</h3>
                <p className="text-white/40 leading-relaxed font-medium text-sm">{feature.desc}</p>
              </div>
              {/* Internal glow reflect */}
              <div className={cn("absolute -bottom-20 -right-20 w-40 h-40 blur-[80px] rounded-full opacity-20 group-hover:opacity-40 transition-opacity", feature.bg)} />
            </motion.div>
          ))}
        </div>
      </section>

      {/* CTA & Code Section */}
      <section className="max-w-7xl mx-auto px-6">
        <div className="glass rounded-[3rem] border border-white/5 bg-gradient-to-br from-white/[0.03] to-transparent p-12 lg:p-20 relative overflow-hidden">
          <div className="flex flex-col lg:flex-row items-center gap-20 relative z-10">
            <div className="flex-1 space-y-10">
              <div className="space-y-6">
                <h2 className="text-4xl md:text-5xl font-display font-bold italic tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-white">
                  Prêt à donner vie à votre serveur ?
                </h2>
                <p className="text-white/40 text-lg font-medium leading-relaxed">
                  Rejoignez des milliers de créateurs qui utilisent DiscordBot AI pour automatiser leur communauté avec l'excellence cognitive de l'IA.
                </p>
              </div>

              <ul className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {[
                  "Modération automatique", 
                  "Système de tickets", 
                  "Musique haute qualité", 
                  "Économie & RPG"
                ].map((item, i) => (
                  <li key={i} className="flex items-center gap-4 text-white/80 group">
                    <div className="w-6 h-6 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center group-hover:scale-110 transition-transform shadow-[0_0_10px_rgba(16,185,129,0.2)]">
                      <Check size={14} className="text-emerald-400" />
                    </div>
                    <span className="font-bold text-sm uppercase tracking-widest text-white/60 group-hover:text-white transition-colors">{item}</span>
                  </li>
                ))}
              </ul>

              <button 
                onClick={() => setView('select-pack')}
                className="px-10 py-5 bg-white/5 border border-white/10 rounded-2xl font-black text-xs uppercase tracking-[0.25em] text-white hover:bg-white/10 transition-all hover:scale-[1.02]"
              >
                Explorer les packs
              </button>
            </div>

            <div className="flex-1 w-full relative">
              <motion.div 
                initial={{ rotateY: 20, rotateX: 10 }}
                whileInView={{ rotateY: 5, rotateX: 5 }}
                transition={{ duration: 2 }}
                className="glass rounded-[2rem] p-1 border border-white/10 shadow-[0_30px_60px_rgba(0,0,0,0.5)] overflow-hidden"
              >
                <div className="bg-[#050505] p-8 space-y-6 font-mono text-xs leading-relaxed min-h-[400px] relative">
                  <div className="flex items-center justify-between border-b border-white/5 pb-4 mb-4">
                    <div className="flex gap-2">
                       <div className="w-3 h-3 rounded-full bg-red-500 opacity-60" />
                       <div className="w-3 h-3 rounded-full bg-amber-500 opacity-60" />
                       <div className="w-3 h-3 rounded-full bg-emerald-500 opacity-60" />
                    </div>
                    <div className="text-[10px] uppercase tracking-widest text-white/20 font-black">bot.js</div>
                  </div>
                  
                  <div className="space-y-1">
                    <p><span className="text-pink-500">const</span> {'{ Client, GatewayIntentBits }'} = <span className="text-cyan-400 group-hover:text-cyan-300">require</span>(<span className="text-emerald-400">'discord.js'</span>);</p>
                    <p><span className="text-pink-500">const</span> client = <span className="text-blue-500">new</span> <span className="text-cyan-400">Client</span>({'{'} intents: [GatewayIntentBits.Guilds] {'}'});</p>
                    <br />
                    <p>client.<span className="text-blue-500">on</span>(<span className="text-emerald-400">'ready'</span>, () ={'>'} {'{'}</p>
                    <p className="pl-6"><span className="text-cyan-400">console</span>.<span className="text-blue-500">log</span>(<span className="text-emerald-400">`Logged in as ${'{client.user.tag}'}!`</span>);</p>
                    <p>{'}'});</p>
                    <br />
                    <p>client.<span className="text-blue-500">on</span>(<span className="text-emerald-400">'interactionCreate'</span>, <span className="text-pink-500">async</span> interaction ={'>'} {'{'}</p>
                    <p className="pl-6"><span className="text-pink-500">if</span> (!interaction.isChatInputCommand()) <span className="text-pink-500">return</span>;</p>
                    <p className="pl-6"><span className="text-pink-500">if</span> (interaction.commandName === <span className="text-emerald-400">'ping'</span>) {'{'}</p>
                    <p className="pl-12"><span className="text-pink-500">await</span> interaction.reply(<span className="text-emerald-400">'Pong!'</span>);</p>
                    <p className="pl-6">{'}'}</p>
                    <p>{'}'});</p>
                    <br />
                    <p>client.<span className="text-blue-500">login</span>(process.env.TOKEN);<span className="inline-block w-2 h-4 bg-cyan-400 animate-blink ml-1 align-middle" /></p>
                  </div>
                  
                  {/* Internal grid texture */}
                  <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:20px_20px] pointer-events-none opacity-20" />
                </div>
              </motion.div>

              {/* Float objects */}
              <div className="absolute -top-10 -right-10 w-24 h-24 bg-cyan-500/20 blur-3xl animate-pulse" />
              <div className="absolute -bottom-10 -left-10 w-24 h-24 bg-purple-500/20 blur-3xl animate-pulse" />
            </div>
          </div>
        </div>
      </section>
    </div>
  );

  const Offres = () => (
    <div className="pt-20 min-h-screen">
      <div className="relative py-20 px-6 overflow-hidden">
        {/* Background Image Layer */}
        <div className="absolute inset-0 z-0">
          <img 
            src="https://images.unsplash.com/photo-1639762681485-074b7f938ba0?q=80&w=2232&auto=format&fit=crop" 
            alt="Cyber Background" 
            className="w-full h-full object-cover opacity-20"
            referrerPolicy="no-referrer"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-[#050505] via-transparent to-[#050505]" />
        </div>

        <div className="relative z-10 max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <motion.h1 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-5xl font-display font-bold mb-4"
            >
              NOS OFFRES
            </motion.h1>
            <motion.div 
              initial={{ width: 0 }}
              animate={{ width: 80 }}
              className="h-1 bg-indigo-500 mx-auto rounded-full" 
            />
            <motion.p 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="mt-6 text-white/60 text-lg max-w-2xl mx-auto"
            >
              Choisissez le pack qui correspond le mieux à vos besoins et propulsez votre serveur Discord vers de nouveaux sommets.
            </motion.p>
          </div>

          <div className="grid lg:grid-cols-3 gap-8 items-stretch">
            {/* PACK FREE */}
            <motion.div 
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              className="cyber-card p-8 rounded-3xl flex flex-col group border-slate-500/10 bg-slate-500/[0.02]"
              style={{ '--card-glow': 'rgba(148, 163, 184, 0.2)', '--card-glow-soft': 'rgba(148, 163, 184, 0.05)' } as any}
            >
              <div className="w-14 h-14 rounded-2xl bg-slate-500/10 flex items-center justify-center mb-6 group-hover:shadow-[0_0_10px_rgba(148, 163, 184, 0.3)] transition-all">
                <BotIcon className="text-slate-400" size={28} />
              </div>
              <h3 className="text-2xl font-display font-bold mb-2 text-slate-300">PACK FREE</h3>
              <p className="text-slate-400/60 text-sm font-medium mb-6">"Pour tester nos services."</p>
              <ul className="space-y-4 mb-8 flex-1">
                {[
                  "Hébergement : Non fourni",
                  "10 Slash Commands basiques",
                  "/Ping & /Aide",
                  "Modération basique (/Ban, /Kick)",
                  "Design Violet (#A855F7)",
                  "1 seul bot tous les 2 jours"
                ].map((item, i) => (
                  <li key={i} className="flex items-center gap-3 text-white/40 group-hover:text-white/60 transition-colors">
                    <Check size={16} className="text-slate-500" />
                    <span className="text-xs">{item}</span>
                  </li>
                ))}
              </ul>
              <button 
                onClick={() => {
                  setSelectedPack('FREE');
                  setView('generator');
                }}
                className="w-full py-3 rounded-xl bg-slate-500/5 border border-slate-500/20 text-slate-400 font-bold hover:bg-slate-500/10 hover:text-slate-300 transition-all"
              >
                Choisir ce pack
              </button>
            </motion.div>

            {/* PACK EXTRA "ULTIME" */}
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="cyber-card neon-border-animate p-8 rounded-3xl flex flex-col lg:scale-110 z-10 group"
              style={{ '--card-glow': 'rgba(168, 85, 247, 0.5)', '--card-glow-soft': 'rgba(168, 85, 247, 0.1)' } as any}
            >
              <div className="absolute -top-4 left-1/2 -translate-x-1/2 px-4 py-1 bg-gradient-to-r from-purple-500 to-cyan-500 rounded-full text-[10px] font-black uppercase tracking-widest shadow-[0_0_15px_rgba(168,85,247,0.5)] animate-pulse">
                RECOMMANDÉ
              </div>
              <div className="w-14 h-14 rounded-2xl bg-purple-500/10 flex items-center justify-center mb-6 group-hover:shadow-[0_0_15px_rgba(168,85,247,0.5)] transition-all">
                <Zap className="text-purple-400" size={28} />
              </div>
              <h3 className="text-2xl font-display font-bold mb-2">PACK EXTRA</h3>
              <p className="text-purple-400/80 text-sm font-medium mb-6">"L'expérience Ultime sans limites."</p>
              <ul className="space-y-4 mb-8 flex-1">
                {[
                  "✨ /create-embed (Formulaire Modal)",
                  "⚙️ Admin: /kick, /ban, /unban, /clear...",
                  "🎫 Tickets: /setup-ticket (Modal)",
                  "📊 Utils: /userinfo, /poll, /say...",
                  "🎉 Giveaways: /gstart, /gend",
                  "🛡️ Welcome & Logs Automatiques",
                  "🎭 Reaction-Roles"
                ].map((item, i) => (
                  <li key={i} className="flex items-center gap-3 text-white/70 group-hover:text-white transition-colors">
                    <Check size={16} className="text-purple-400 group-hover:drop-shadow-[0_0_5px_rgba(168,85,247,0.8)]" />
                    <span className="text-sm">{item}</span>
                  </li>
                ))}
              </ul>
              <button 
                onClick={() => handlePackSelection('PACK EXTRA')}
                className="w-full py-3 rounded-xl bg-purple-600 font-bold shadow-[0_0_20px_rgba(168,85,247,0.4)] hover:bg-purple-500 hover:scale-105 transition-all"
              >
                Choisir ce pack
              </button>
            </motion.div>

            {/* PACK SUR MESURE */}
            <motion.div 
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              className="cyber-card p-8 rounded-3xl flex flex-col group"
              style={{ '--card-glow': 'rgba(234, 179, 8, 0.5)', '--card-glow-soft': 'rgba(234, 179, 8, 0.1)' } as any}
            >
              <div className="w-14 h-14 rounded-2xl bg-yellow-500/10 flex items-center justify-center mb-6 group-hover:shadow-[0_0_15px_rgba(234,179,8,0.5)] transition-all">
                <Sparkles className="text-yellow-400" size={28} />
              </div>
              <h3 className="text-2xl font-display font-bold mb-2">PACK SUR MESURE</h3>
              <p className="text-yellow-400/80 text-sm font-medium mb-6">"Le contrôle total : aucune limite de code."</p>
              <ul className="space-y-4 mb-8 flex-1">
                {[
                  "Commandes à la carte",
                  "Systèmes complexes (Économie, XP, API)",
                  "Mini-jeux personnalisés",
                  "Design unique et Code libre"
                ].map((item, i) => (
                  <li key={i} className="flex items-center gap-3 text-white/70 group-hover:text-white transition-colors">
                    <Check size={16} className="text-yellow-400 group-hover:drop-shadow-[0_0_5px_rgba(234,179,8,0.8)]" />
                    <span className="text-sm">{item}</span>
                  </li>
                ))}
              </ul>
              <button 
                onClick={() => handlePackSelection('PACK SUR MESURE')}
                className="w-full py-3 rounded-xl bg-yellow-500/10 border border-yellow-500/20 font-bold hover:bg-yellow-500 hover:text-white transition-all"
              >
                Choisir ce pack
              </button>
            </motion.div>
          </div>

          {/* Pricing Banner & Support Button */}
          <div className="mt-16 flex flex-col items-center gap-8">
            <div className="px-8 py-4 glass rounded-2xl border-indigo-500/30 text-lg font-medium text-white/80">
              TARIFS : <span className="text-indigo-400 font-bold">Prix à discuter selon la complexité.</span>
            </div>
            <button className="group relative px-10 py-5 bg-white text-black rounded-2xl font-black text-xl flex items-center gap-3 hover:scale-105 transition-all shadow-[0_0_30px_rgba(255,255,255,0.3)]">
              <Ticket size={24} className="group-hover:rotate-12 transition-transform" />
              OUVRIR UN TICKET SUPPORT
              <div className="absolute inset-0 rounded-2xl bg-white animate-ping opacity-20 pointer-events-none" />
            </button>
            <p className="text-white/30 text-xs italic">Note : Le Pack FREE n'inclut pas de support prioritaire ni d'hébergement.</p>
          </div>
        </div>
      </div>
    </div>
  );

  const handlePackSelection = async (packName: string) => {
    const cleanPackName = packName.replace('PACK ', '') as any;
    
    if (user) {
      try {
        // Save pack to user profile
        try {
          await setDoc(doc(db, 'users', user.id), {
            selectedPack: cleanPackName,
            uid: user.id,
            email: user.email,
            displayName: user.displayName
          }, { merge: true });
        } catch (e) {
          handleFirestoreError(e, OperationType.UPDATE, `users/${user.id}`);
        }
        
        setSelectedPack(cleanPackName);
        setUser(prev => prev ? { ...prev, selectedPack: cleanPackName } : null);

        if (cleanPackName === "FREE") {
          setView('generator');
        } else {
          try {
            await addDoc(collection(db, 'orders'), {
              userId: user.id,
              user: user.email,
              pack: packName,
              status: 'En attente',
              date: new Date().toISOString().split('T')[0]
            });
          } catch (e) {
            handleFirestoreError(e, OperationType.CREATE, 'orders');
          }
          window.open('https://discord.gg/9YRwJTfVNX', '_blank');
          setView('dashboard');
        }
      } catch (e) {
        console.error("Failed to update pack", e);
      }
    } else {
      setView('login');
    }
  };

  const SelectPack = () => (
    <div className="pt-32 pb-20 px-6 max-w-7xl mx-auto">
      <div className="text-center mb-16">
        <h1 className="text-4xl font-display font-bold mb-4">CHOISISSEZ VOTRE PACK</h1>
        <p className="text-white/50">Sélectionnez une offre pour continuer vers notre serveur Discord et finaliser votre bot.</p>
      </div>
      <div className="grid lg:grid-cols-3 gap-8 items-stretch">
        {/* Reuse the same cards but with redirect */}
        {[
          { 
            name: "PACK FREE", 
            tagline: "Pour tester nos services.", 
            color: "slate", 
            icon: <BotIcon size={28} />,
            features: [
              "Hébergement : Non fourni", 
              "10 Slash Commands basiques", 
              "/Ping & /Aide", 
              "Modération basique (/Ban, /Kick)", 
              "Design Violet (#A855F7)",
              "1 seul bot tous les 2 jours"
            ]
          },
          { 
            name: "PACK EXTRA", 
            tagline: "L'expérience Ultime sans limites.", 
            color: "purple", 
            icon: <Zap size={28} />,
            recommended: true,
            features: [
              "✨ /create-embed (Modal)",
              "⚙️ Admin: /kick, /ban, /unban...",
              "🎫 Tickets: /setup-ticket (Modal)",
              "📊 Utils: /userinfo, /poll, /say...",
              "🎉 Giveaways: /gstart, /gend",
              "🛡️ Welcome & Logs Automatiques",
              "🎭 Reaction-Roles"
            ]
          },
          { 
            name: "PACK SUR MESURE", 
            tagline: "Le contrôle total : aucune limite de code.", 
            color: "yellow", 
            icon: <Sparkles size={28} />,
            features: ["Commandes à la carte", "Systèmes complexes (Économie, XP, API)", "Mini-jeux personnalisés", "Design unique et Code libre"]
          }
        ].map((pack, i) => (
          <motion.div 
            key={i}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.1 }}
            className={cn(
              "cyber-card p-8 rounded-3xl flex flex-col group relative",
              pack.recommended && "neon-border-animate lg:scale-105 z-10"
            )}
            style={{ 
              '--card-glow': pack.color === 'blue' ? 'rgba(59, 130, 246, 0.5)' : pack.color === 'purple' ? 'rgba(168, 85, 247, 0.5)' : pack.color === 'yellow' ? 'rgba(234, 179, 8, 0.5)' : 'rgba(148, 163, 184, 0.2)',
              '--card-glow-soft': pack.color === 'blue' ? 'rgba(59, 130, 246, 0.1)' : pack.color === 'purple' ? 'rgba(168, 85, 247, 0.1)' : pack.color === 'yellow' ? 'rgba(234, 179, 8, 0.1)' : 'rgba(148, 163, 184, 0.05)'
            } as any}
          >
            {pack.recommended && (
              <div className="absolute -top-4 left-1/2 -translate-x-1/2 px-4 py-1 bg-gradient-to-r from-purple-500 to-cyan-500 rounded-full text-[10px] font-black uppercase tracking-widest shadow-[0_0_15px_rgba(168, 85, 247, 0.5)] animate-pulse">
                RECOMMANDÉ
              </div>
            )}
            <div className={cn(
              "w-14 h-14 rounded-2xl flex items-center justify-center mb-6 transition-all",
              pack.color === 'blue' ? "bg-blue-500/10 text-blue-400" : pack.color === 'purple' ? "bg-purple-500/10 text-purple-400" : pack.color === 'yellow' ? "bg-yellow-500/10 text-yellow-400" : "bg-slate-500/10 text-slate-400"
            )}>
              {pack.icon}
            </div>
            <h3 className={cn("text-2xl font-display font-bold mb-2", pack.color === 'slate' && "text-slate-300")}>{pack.name}</h3>
            <p className={cn("text-sm font-medium mb-6", pack.color === 'blue' ? "text-blue-400/80" : pack.color === 'purple' ? "text-purple-400/80" : pack.color === 'yellow' ? "text-yellow-400/80" : "text-slate-400/60")}>{pack.tagline}</p>
            <ul className="space-y-4 mb-8 flex-1">
              {pack.features.map((feat, j) => (
                <li key={j} className="flex items-center gap-3 text-white/70 text-sm">
                  <Check size={16} className={cn(pack.color === 'blue' ? "text-blue-400" : pack.color === 'purple' ? "text-purple-400" : pack.color === 'yellow' ? "text-yellow-400" : "text-slate-500")} />
                  {feat}
                </li>
              ))}
            </ul>
            <button 
              onClick={() => handlePackSelection(pack.name)}
              className={cn(
                "w-full py-3 rounded-xl font-bold transition-all",
                pack.color === 'blue' ? "bg-blue-500/10 border border-blue-500/20 hover:bg-blue-500" : 
                pack.color === 'purple' ? "bg-purple-600 shadow-[0_0_20px_rgba(168, 85, 247, 0.4)] hover:bg-purple-500" : 
                pack.color === 'yellow' ? "bg-yellow-500/10 border border-yellow-500/20 hover:bg-yellow-500" : 
                "bg-slate-500/5 border border-slate-500/20 text-slate-400 hover:bg-slate-500/10"
              )}
            >
              Choisir ce pack
            </button>
          </motion.div>
        ))}
      </div>
    </div>
  );

  const StaffLogin = () => {
    const [input, setInput] = useState('');
    const [error, setError] = useState('');

    const handleStaffLogin = (e: React.FormEvent) => {
      e.preventDefault();
      if (input === 'STAFF_DISCORDBOT') {
        setIsStaff(true);
        setView('staff-dashboard');
      } else {
        setError('Code incorrect');
      }
    };

    return (
      <div className="pt-32 pb-20 px-6 flex items-center justify-center min-h-[70vh]">
        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="glass p-10 rounded-3xl w-full max-w-md border-indigo-500/20"
        >
          <div className="text-center mb-8">
            <div className="w-16 h-16 bg-indigo-600/20 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <Shield className="text-indigo-400" size={32} />
            </div>
            <h1 className="text-2xl font-bold">Accès Staff</h1>
            <p className="text-white/40 text-sm mt-2">Veuillez entrer le code d'accès sécurisé.</p>
          </div>
          <form onSubmit={handleStaffLogin} className="space-y-6">
            <div>
              <input 
                type="password"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Code Staff"
                className="w-full bg-white/5 border border-white/10 rounded-xl px-6 py-4 text-white focus:outline-none focus:border-indigo-500 transition-all text-center tracking-[1em]"
              />
              {error && <p className="text-red-400 text-xs mt-2 text-center">{error}</p>}
            </div>
            <button className="w-full py-4 bg-indigo-600 rounded-xl font-bold glow-primary hover:bg-indigo-500 transition-all">
              Se connecter
            </button>
          </form>
        </motion.div>
      </div>
    );
  };

  const StaffDashboard = () => (
    <div className="min-h-screen bg-transparent pt-32 pb-20 px-6 relative overflow-hidden scanline">
      {/* Volumetric background lights */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-1/2 left-1/4 w-[800px] h-[800px] bg-indigo-600/5 blur-[200px] rounded-full animate-pulse" />
        <div className="absolute bottom-1/4 right-1/4 w-[600px] h-[600px] bg-cyan-600/5 blur-[150px] rounded-full" />
      </div>

      <div className="max-w-7xl mx-auto space-y-12 relative z-10">
        {/* 1. L'En-tête et Titre */}
        <div className="flex flex-col md:flex-row items-center justify-between gap-8 border-b border-white/5 pb-12">
          <div className="flex items-center gap-6 group">
            <div className="w-20 h-20 bg-cyan-500/10 rounded-2xl flex items-center justify-center border border-cyan-500/20 shadow-[0_0_30px_rgba(34,211,238,0.2)] animate-float">
              <Shield className="text-cyan-400 drop-shadow-[0_0_15px_rgba(34,211,238,0.8)]" size={40} />
            </div>
            <div>
              <h1 className="text-5xl font-display font-bold tracking-tighter text-white italic">
                Dashboard Staff
              </h1>
              <p className="text-white/40 text-lg font-medium tracking-tight mt-1">Gestion des validations de packs et paiements.</p>
            </div>
          </div>
          
          <button 
            onClick={() => setView('landing')} 
            className="red-alert-btn px-10 py-5"
          >
            <LogOut size={20} /> Quitter
          </button>
        </div>

        {/* 2. Le Panneau de Contrôle "Commandes en attente" (Centre) */}
        <motion.div 
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          className="generator-panel circuit-grid relative p-12 min-h-[400px] flex flex-col items-center justify-center border-t-2 border-cyan-500/40"
        >
          <div className="absolute top-0 left-0 w-20 h-1 bg-cyan-400 shadow-[0_0_15px_rgba(34,211,238,0.8)]" />
          <div className="absolute top-0 right-0 w-20 h-1 bg-cyan-400 shadow-[0_0_15px_rgba(34,211,238,0.8)]" />
          
          <div className="space-y-8 text-center">
            <h2 className="text-4xl md:text-6xl font-display font-bold tracking-[0.15em] text-white/90 italic flex items-center gap-6 justify-center">
              <span className="led-cyan">COMMANDES EN ATTENTE</span>
            </h2>
            
            <div className="flex items-center justify-center gap-4">
              <div className="px-10 py-4 bg-purple-600 rounded-2xl font-black text-2xl tracking-tighter text-white shadow-[0_0_40px_rgba(168,85,247,0.4)] border border-purple-400/30">
                {pendingOrders.length} NOUVELLES
              </div>
            </div>
          </div>

          <div className="mt-12 w-full grid gap-4 max-w-4xl">
            {pendingOrders.length > 0 ? (
              pendingOrders.map((order) => (
                <div key={order.id} className="glass p-6 rounded-2xl flex items-center justify-between border-white/5 hover:bg-white/[0.05] transition-all group">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-xl bg-purple-500/10 flex items-center justify-center border border-purple-500/20 group-hover:scale-110 transition-transform">
                      <BotIcon className="text-purple-400" size={24} />
                    </div>
                    <div>
                      <div className="font-bold text-white tracking-tight">{order.user}</div>
                      <div className="text-[10px] text-white/40 uppercase tracking-widest">{order.pack} • {order.date}</div>
                    </div>
                  </div>
                  <button 
                    onClick={async () => {
                      try {
                        await deleteDoc(doc(db, 'orders', order.id));
                        setPendingOrders(prev => prev.filter(o => o.id !== order.id));
                      } catch (e) {
                        console.error("Failed to delete order", e);
                      }
                    }}
                    className="px-6 py-2 bg-indigo-600 rounded-xl text-xs font-black uppercase tracking-widest text-white shadow-xl hover:bg-indigo-500 active:scale-95 transition-all"
                  >
                    Approuver
                  </button>
                </div>
              ))
            ) : (
              <p className="text-white/20 text-center font-mono text-sm tracking-[0.3em]">SYSTÈME PRÊT • AUCUNE TÂCHE</p>
            )}
          </div>
        </motion.div>

        {/* 3. Grille de Saisie et Validation (Nouveaux éléments) */}
        <div className="grid md:grid-cols-3 gap-8">
          {/* Tuile 1 */}
          <motion.div 
            whileHover={{ y: -10 }}
            className="cockpit-card glass p-10 rounded-[2.5rem] border-white/5 h-[320px] flex flex-col justify-between"
          >
            <div className="space-y-6">
              <div className="w-16 h-16 bg-purple-500/10 rounded-2xl flex items-center justify-center border border-purple-500/20 shadow-[0_0_20px_rgba(168,85,247,0.1)]">
                <Ticket className="text-purple-400 drop-shadow-[0_0_10px_rgba(168,85,247,0.8)]" size={32} />
              </div>
              <div className="space-y-2">
                <h3 className="text-2xl font-display font-bold italic tracking-tight led-purple">Validation de Packs</h3>
                <p className="text-white/40 text-sm leading-relaxed">Vérifiez et approuvez les packs créés par les utilisateurs.</p>
              </div>
            </div>
            <button 
              onClick={() => setView('pack-management')}
              className="w-full py-4 rounded-xl violet-blue-glow-btn text-xs tracking-widest uppercase"
            >
              Voir la liste
            </button>
          </motion.div>

          {/* Tuile 2 */}
          <motion.div 
            whileHover={{ y: -10 }}
            className="cockpit-card glass p-10 rounded-[2.5rem] border-white/5 h-[320px] flex flex-col justify-between"
          >
            <div className="space-y-6">
              <div className="w-16 h-16 bg-gold-500/10 rounded-2xl flex items-center justify-center border border-gold-500/20 shadow-[0_0_20px_rgba(245,158,11,0.1)]">
                <Database className="text-gold-400 drop-shadow-[0_0_10px_rgba(245,158,11,0.8)]" size={32} />
              </div>
              <div className="space-y-2">
                <h3 className="text-2xl font-display font-bold italic tracking-tight amber-glow">Paiements en attente</h3>
                <p className="text-white/40 text-sm leading-relaxed">Vérifiez l'état des transactions financières.</p>
              </div>
            </div>
            <button 
              onClick={() => setView('transaction-tracking')}
              className="w-full py-4 rounded-xl gold-neon-btn text-xs tracking-widest uppercase"
            >
              Voir les transactions
            </button>
          </motion.div>

          {/* Tuile 3 */}
          <motion.div 
            whileHover={{ y: -10 }}
            className="cockpit-card glass p-10 rounded-[2.5rem] border-white/5 h-[320px] flex flex-col justify-between"
          >
            <div className="space-y-6">
              <div className="w-16 h-16 bg-red-500/10 rounded-2xl flex items-center justify-center border border-red-500/20 shadow-[0_0_20px_rgba(239,68,68,0.1)]">
                <AlertTriangle className="text-red-400 drop-shadow-[0_0_10px_rgba(239,68,68,0.8)]" size={32} />
              </div>
              <div className="space-y-2">
                <h3 className="text-2xl font-display font-bold italic tracking-tight text-red-500 shadow-red-500/50">Tickets de support</h3>
                <p className="text-white/40 text-sm leading-relaxed">Répondez aux requêtes d'aide des utilisateurs.</p>
              </div>
            </div>
            <button 
              onClick={() => setView('support')}
              className="w-full py-4 rounded-xl glass border-red-500/20 hover:border-red-500/50 text-red-400/60 hover:text-red-400 text-xs tracking-widest uppercase transition-all"
            >
              Voir les tickets
            </button>
          </motion.div>
        </div>
      </div>
    </div>
  );

  const SupportTickets = () => {
    const [tickets, setTickets] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
      const q = query(collection(db, 'tickets'), orderBy('created_at', 'desc'));
      const unsubscribe = onSnapshot(q, (snapshot) => {
        const tks = snapshot.docs.map(doc => ({ 
          id: doc.id, 
          ...doc.data(),
          activity: doc.data().created_at?.toDate() ? `Il y a ${Math.floor((Date.now() - doc.data().created_at.toDate()) / 60000)} min` : 'À l\'instant'
        }));
        setTickets(tks);
        setLoading(false);
      });
      return () => unsubscribe();
    }, []);

    const updateTicketStatus = async (id: string, newStatus: string) => {
      try {
        await updateDoc(doc(db, 'tickets', id), { status: newStatus });
      } catch (e) {
        console.error("Failed to update ticket", e);
      }
    };

    const takeCharge = async (id: string) => {
      try {
        await updateDoc(doc(db, 'tickets', id), { 
          status: 'OUVERT',
          assignedStaffId: user?.id || 'staff'
        });
        openChat(id);
      } catch (e) {
        console.error("Failed to take charge", e);
      }
    };

    const openChat = (id: string) => {
      setSelectedTicketId(id);
      setView('ticket-chat');
    };

    return (
      <div className="min-h-screen bg-transparent pt-32 pb-20 px-6 relative overflow-hidden scanline">
        {/* Volumetric backgrounds */}
        <div className="fixed inset-0 pointer-events-none">
          <div className="absolute top-1/2 left-1/4 w-[800px] h-[800px] bg-purple-600/5 blur-[200px] rounded-full animate-pulse" />
          <div className="absolute top-1/4 right-1/4 w-[600px] h-[600px] bg-cyan-600/5 blur-[150px] rounded-full" />
        </div>

        <div className="max-w-7xl mx-auto space-y-12 relative z-10">
          {/* Header */}
          <header className="text-center space-y-6">
            <motion.div 
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="flex items-center justify-center gap-6"
            >
              <div className="w-20 h-20 bg-amber-500/10 rounded-[2rem] flex items-center justify-center border border-amber-500/20 shadow-[0_0_30px_rgba(245,158,11,0.15)]">
                <Lightbulb className="text-amber-400 drop-shadow-[0_0_15px_rgba(251,191,36,0.8)]" size={40} />
              </div>
              <h1 className="text-6xl font-display font-bold tracking-tighter text-white italic">SUPPORT & TICKETS</h1>
            </motion.div>
            <p className="text-white/40 text-xl font-medium max-w-2xl mx-auto leading-relaxed">Gérez vos requêtes d'aide et vos interactions avec le staff.</p>
          </header>

          {/* Table Container */}
          <motion.div 
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            className="glass rounded-[2.5rem] border border-white/10 overflow-hidden relative shadow-[0_40px_100px_rgba(0,0,0,0.6)]"
          >
            {/* Fine cyan border light */}
            <div className="absolute inset-0 border border-cyan-400/10 rounded-[2.5rem] pointer-events-none" />

            {/* Toolbar */}
            <div className="p-10 border-b border-white/5 flex flex-col md:flex-row items-center justify-between gap-8 bg-white/[0.01]">
              <div className="flex items-center gap-4">
                <button className="px-8 py-4 glass rounded-2xl text-[11px] font-black uppercase tracking-[0.2em] flex items-center gap-3 border-cyan-400/20 text-cyan-400 shadow-[0_0_20px_rgba(34,211,238,0.1)] hover:bg-cyan-500/10 transition-all">
                  <Filter size={18} /> Trier par : Ouvert
                </button>
              </div>
              <div className="relative w-full md:w-[450px] group">
                <Search className="absolute left-5 top-1/2 -translate-y-1/2 text-white/20 group-hover:text-cyan-400 transition-colors" size={20} />
                <input 
                  type="text" 
                  placeholder="Chercher un ticket..."
                  className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 pl-14 pr-8 text-sm focus:outline-none focus:border-cyan-400/30 transition-all backdrop-blur-3xl font-medium"
                />
              </div>
            </div>

            {/* Table Header */}
            <div className="px-10 py-6 grid grid-cols-12 gap-8 text-[11px] font-black uppercase tracking-[0.3em] text-cyan-400/60 border-b border-white/5 bg-black/20">
              <div className="col-span-2">ID TICKET</div>
              <div className="col-span-4">TITRE</div>
              <div className="col-span-2 text-center">UTILISATEUR</div>
              <div className="col-span-2 text-center">STATUT</div>
              <div className="col-span-2 text-right">ACTIVITÉ</div>
            </div>

            {/* Table Content */}
            <div className="divide-y divide-white/5">
              {tickets.map((ticket, i) => (
                <motion.div 
                  key={ticket.id}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.1 }}
                  className="px-10 py-8 grid grid-cols-12 gap-8 items-center hover:bg-white/[0.04] transition-all cursor-pointer group relative"
                >
                   {/* Left highlight */}
                  <div className="absolute left-0 top-0 bottom-0 w-1 bg-cyan-400 scale-y-0 group-hover:scale-y-100 transition-transform origin-top" />
                  
                  <div className="col-span-2 font-mono text-sm text-white/40 group-hover:text-white transition-colors">{ticket.id}</div>
                  <div className="col-span-4 flex items-center gap-5">
                    <div className="w-12 h-12 bg-white/[0.03] rounded-xl flex items-center justify-center border border-white/10 group-hover:border-cyan-400/30 group-hover:bg-cyan-500/10 transition-all">
                      <Rocket className="text-white/60 group-hover:text-cyan-400 transition-colors" size={22} />
                    </div>
                    <div className="font-bold text-lg text-white group-hover:text-cyan-400 transition-colors tracking-tight">{ticket.subject}</div>
                  </div>
                  <div className="col-span-2 text-center text-xs text-white/40 font-medium truncate">{ticket.user}</div>
                  <div className="col-span-2 flex flex-col items-center gap-2">
                    <div className={cn(
                      "px-6 py-2 rounded-full text-[10px] font-black uppercase tracking-[0.2em] flex items-center gap-3 border shadow-2xl transition-all group-hover:scale-105",
                      ticket.status === 'OUVERT' ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" :
                      ticket.status === 'EN ATTENTE' ? "bg-amber-500/10 text-amber-400 border-amber-500/20" :
                      "bg-red-500/10 text-red-500 border-red-500/20"
                    )}>
                      <div className={cn("w-2 h-2 rounded-full animate-pulse shadow-[0_0_8px_currentColor]", 
                        ticket.status === 'OUVERT' ? "bg-emerald-400" : 
                        ticket.status === 'EN ATTENTE' ? "bg-amber-400" : "bg-red-500"
                      )} />
                      {ticket.status}
                    </div>
                    <select 
                      onChange={(e) => updateTicketStatus(ticket.id, e.target.value)}
                      value={ticket.status}
                      className="bg-transparent text-[8px] uppercase font-black tracking-widest text-white/20 hover:text-cyan-400 focus:outline-none transition-colors cursor-pointer"
                    >
                      <option value="OUVERT" className="bg-[#020202]">OUVERT</option>
                      <option value="EN ATTENTE" className="bg-[#020202]">EN ATTENTE</option>
                      <option value="FERMÉ" className="bg-[#020202]">FERMÉ</option>
                    </select>
                  </div>
                  <div className="col-span-2 flex items-center justify-end gap-8">
                    <span className="text-[11px] text-white/20 font-black uppercase tracking-widest group-hover:text-white/40 transition-colors">{ticket.activity}</span>
                    {ticket.status === 'EN ATTENTE' && (
                      <button 
                        onClick={(e) => { e.stopPropagation(); takeCharge(ticket.id); }}
                        className="px-6 py-3 rounded-xl bg-cyan-500 text-black text-[10px] font-black uppercase tracking-widest hover:scale-105 transition-all shadow-[0_0_20px_rgba(34,211,238,0.4)]"
                      >
                        Prendre en charge
                      </button>
                    )}
                    <button 
                      onClick={() => openChat(ticket.id)}
                      className="w-12 h-12 rounded-2xl violet-blue-glow-btn flex items-center justify-center hover:scale-110 active:scale-95 transition-all shadow-2xl"
                    >
                      <ChevronRight size={22} />
                    </button>
                  </div>
                </motion.div>
              ))}
            </div>
          </motion.div>

          {/* Footer Navigation */}
          <div className="flex justify-center pt-8">
               <button 
                onClick={() => setView('staff-dashboard')}
                className="px-12 py-5 glass border border-white/5 rounded-3xl flex items-center gap-4 text-xs font-black uppercase tracking-[0.25em] text-white/40 hover:text-white hover:border-white/20 hover:bg-white/[0.05] transition-all group"
               >
                 <Shield size={20} className="group-hover:rotate-12 transition-transform" /> Retour au Dashboard Staff
               </button>
          </div>
        </div>
      </div>
    );
  };

  const MemberSupport = () => {
    const [subject, setSubject] = useState('');
    const [description, setDescription] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [myTickets, setMyTickets] = useState<any[]>([]);
    const maxChars = 500;

    useEffect(() => {
      if (!user) return;
      const q = query(collection(db, 'tickets'), where('userId', '==', user.id), orderBy('created_at', 'desc'));
      const unsubscribe = onSnapshot(q, (snapshot) => {
        const tks = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        setMyTickets(tks);
      });
      return () => unsubscribe();
    }, [user]);

    const handleSubmit = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!user || !subject || !description) return;
      setSubmitting(true);
      try {
        await addDoc(collection(db, 'tickets'), {
          userId: user.id,
          user: user.email,
          subject,
          description,
          status: 'EN ATTENTE',
          created_at: Timestamp.now()
        });
        setSubject('');
        setDescription('');
      } catch (e) {
        console.error("Failed to create ticket", e);
      } finally {
        setSubmitting(false);
      }
    };

    const openChat = (id: string) => {
      setSelectedTicketId(id);
      setView('ticket-chat');
    };

    return (
      <div className="min-h-screen bg-transparent pt-32 pb-20 px-6 relative overflow-hidden scanline">
        <div className="fixed inset-0 pointer-events-none">
          <div className="absolute top-1/2 left-1/4 w-[800px] h-[800px] bg-cyan-600/5 blur-[200px] rounded-full" />
          <div className="absolute bottom-1/4 right-1/4 w-[600px] h-[600px] bg-purple-600/5 blur-[150px] rounded-full" />
        </div>

        <div className="max-w-4xl mx-auto space-y-12 relative z-10">
          <header className="text-center space-y-4">
            <motion.div 
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="flex items-center justify-center gap-6"
            >
              <div className="w-16 h-16 bg-cyan-500/10 rounded-2xl flex items-center justify-center border border-cyan-500/20 shadow-[0_0_20px_rgba(34,211,238,0.1)]">
                <Lightbulb className="text-cyan-400 drop-shadow-[0_0_10px_rgba(34,211,238,0.8)]" size={32} />
              </div>
              <h1 className="text-5xl font-display font-bold tracking-tight text-white italic">CENTRE DE SUPPORT</h1>
            </motion.div>
            <p className="text-white/40 text-lg font-medium">Besoin d'aide ? Notre équipe est là pour vous.</p>
          </header>

          <motion.div 
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            className="glass p-12 rounded-[2.5rem] border border-cyan-400/10 shadow-[0_40px_100px_rgba(0,0,0,0.6)] relative group"
          >
            {/* Fine border highlight */}
            <div className="absolute inset-0 border border-cyan-400/10 rounded-[2.5rem] pointer-events-none group-hover:border-cyan-400/30 transition-colors" />
            
            <div className="space-y-10">
              <div className="text-center">
                <h2 className="text-3xl font-display font-bold italic tracking-tight text-white led-cyan">CRÉER UN NOUVEAU TICKET</h2>
              </div>

              <div className="space-y-8">
                <div className="space-y-3">
                  <label className="text-[10px] uppercase tracking-[0.3em] font-black text-cyan-400/60 ml-1">Sujet de votre requête</label>
                  <input 
                    type="text" 
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    placeholder="Ex: Problème technique avec mon bot"
                    className="w-full bg-white/5 border border-white/10 rounded-2xl py-5 px-8 text-sm focus:outline-none focus:border-cyan-400/40 transition-all font-medium placeholder:text-white/10"
                  />
                </div>

                <div className="space-y-3">
                  <label className="text-[10px] uppercase tracking-[0.3em] font-black text-cyan-400/60 ml-1">Description détaillée</label>
                  <div className="relative">
                    <textarea 
                      value={description}
                      onChange={(e) => setDescription(e.target.value.slice(0, maxChars))}
                      placeholder="Décrivez votre problème le plus précisément possible..."
                      rows={6}
                      className="w-full bg-white/5 border border-white/10 rounded-2xl py-5 px-8 text-sm focus:outline-none focus:border-cyan-400/40 transition-all font-medium placeholder:text-white/10 resize-none"
                    />
                    {/* Progress bar */}
                    <div className="absolute bottom-4 right-6 left-6 h-1 bg-white/5 rounded-full overflow-hidden">
                      <motion.div 
                        initial={{ width: 0 }}
                        animate={{ width: `${(description.length / maxChars) * 100}%` }}
                        className="h-full bg-gradient-to-r from-cyan-400 to-indigo-500 shadow-[0_0_10px_rgba(34,211,238,0.5)]"
                      />
                    </div>
                  </div>
                  <div className="flex justify-end pr-2">
                    <span className="text-[10px] font-mono text-white/20 tracking-widest">{description.length} / {maxChars}</span>
                  </div>
                </div>
              </div>

              <div className="flex justify-center">
                <button 
                  onClick={handleSubmit}
                  disabled={submitting}
                  className="px-16 py-6 rounded-3xl violet-blue-glow-btn flex items-center gap-4 text-xs font-black uppercase tracking-[0.25em] transition-all hover:scale-105 active:scale-95 group disabled:opacity-50"
                >
                  <Zap size={18} className={cn("group-hover:animate-pulse", submitting && "animate-spin")} />
                  {submitting ? 'Envoi...' : 'Créer mon ticket'}
                </button>
              </div>
            </div>
          </motion.div>

          <div className="space-y-8">
            <h3 className="text-[11px] font-black uppercase tracking-[0.4em] text-white/20 ml-2">VOS TICKETS OUVERTS</h3>
            <div className="grid gap-4">
              {myTickets.map((ticket, i) => (
                <motion.div 
                  key={ticket.id}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.1 }}
                  className="glass p-6 rounded-2xl border border-white/5 flex items-center justify-between group hover:bg-white/[0.03] transition-all"
                >
                  <div className="flex items-center gap-6">
                    <span className="font-mono text-xs text-white/20">#{ticket.id.slice(0, 8)}</span>
                    <h4 className="font-bold text-white group-hover:text-cyan-400 transition-colors">{ticket.subject}</h4>
                  </div>
                  <div className="flex items-center gap-8">
                    <div className={cn(
                      "px-5 py-1.5 rounded-full text-[9px] font-black uppercase tracking-widest flex items-center gap-2 border",
                      ticket.status === 'OUVERT' ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" : "bg-amber-500/10 text-amber-400 border-amber-500/20"
                    )}>
                      <div className={cn("w-1.5 h-1.5 rounded-full", ticket.status === 'OUVERT' ? "bg-emerald-400 animate-pulse" : "bg-amber-400")} />
                      {ticket.status}
                    </div>
                    <button 
                      onClick={() => openChat(ticket.id)}
                      className="px-6 py-2 rounded-xl violet-blue-glow-btn text-[10px] font-black uppercase tracking-widest"
                    >
                      Voir
                    </button>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  };

  const TicketChat = () => {
    const [ticket, setTicket] = useState<any>(null);
    const [messages, setMessages] = useState<any[]>([]);
    const [newMessage, setNewMessage] = useState('');
    const scrollRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
      if (!selectedTicketId) return;
      
      const ticketRef = doc(db, 'tickets', selectedTicketId);
      const unsubscribeTicket = onSnapshot(ticketRef, (docSnap) => {
        if (docSnap.exists()) {
          setTicket({ id: docSnap.id, ...docSnap.data() });
        }
      });

      const q = query(
        collection(db, 'tickets', selectedTicketId, 'messages'),
        orderBy('timestamp', 'asc')
      );
      const unsubscribeMessages = onSnapshot(q, (snapshot) => {
        setMessages(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      });

      return () => {
        unsubscribeTicket();
        unsubscribeMessages();
      };
    }, []);

    useEffect(() => {
      if (scrollRef.current) {
        scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
      }
    }, [messages]);

    const handleSendMessage = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!newMessage.trim() || !selectedTicketId || !user) return;

      try {
        await addDoc(collection(db, 'tickets', selectedTicketId, 'messages'), {
          userId: user.id,
          userName: user.displayName || user.email,
          text: newMessage.trim(),
          isStaff: isStaff,
          timestamp: Timestamp.now()
        });
        setNewMessage('');
      } catch (e) {
        console.error("Failed to send message", e);
      }
    };

    if (!ticket) return null;

    return (
      <div className="min-h-screen bg-transparent pt-32 pb-20 px-6 relative overflow-hidden scanline">
        <div className="max-w-6xl mx-auto space-y-8 relative z-10">
          <div className="flex items-center justify-between">
            <button 
              onClick={() => setView(isStaff ? 'support' : 'member-support')}
              className="flex items-center gap-3 text-white/40 hover:text-white transition-colors uppercase text-[10px] font-black tracking-widest"
            >
              <ArrowLeft size={16} /> Retour
            </button>
            <div className="flex items-center gap-4">
              <span className="text-[10px] font-mono text-white/20">#{ticket.id.slice(0, 8)}</span>
              <div className={cn(
                "px-4 py-1.5 rounded-full text-[9px] font-black uppercase tracking-widest border",
                ticket.status === 'OUVERT' ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" :
                ticket.status === 'EN ATTENTE' ? "bg-amber-500/10 text-amber-400 border-amber-500/20" :
                "bg-red-500/10 text-red-500 border-red-500/20"
              )}>
                {ticket.status}
              </div>
            </div>
          </div>

          <div className="glass rounded-[2.5rem] border border-white/10 overflow-hidden shadow-[0_40px_100px_rgba(0,0,0,0.6)] flex flex-col h-[80vh]">
            {/* Ticket Header Info */}
            <div className="p-8 border-b border-white/5 bg-white/[0.02]">
              <h1 className="text-2xl font-display font-bold text-white italic tracking-tight">{ticket.subject}</h1>
              <p className="text-white/40 text-sm mt-2 leading-relaxed">{ticket.description}</p>
            </div>

            {/* Chat Area */}
            <div ref={scrollRef} className="flex-1 overflow-y-auto p-8 space-y-6 scrollbar-hide">
              {messages.length === 0 && (
                <div className="text-center py-12 text-white/10 italic text-sm">Début de la discussion...</div>
              )}
              {messages.map((msg) => (
                <div key={msg.id} className={cn("flex flex-col", msg.isStaff ? "items-start" : "items-end")}>
                  <div className={cn(
                    "max-w-[80%] p-5 rounded-2xl text-sm leading-relaxed",
                    msg.isStaff 
                      ? "bg-white/5 border border-white/10 rounded-tl-none text-white/80" 
                      : "violet-blue-glow-btn text-white rounded-tr-none shadow-[0_10px_20px_rgba(0,0,0,0.2)]"
                  )}>
                    <div className="flex items-center gap-3 mb-2 opacity-40 text-[10px] font-black uppercase tracking-widest">
                       {msg.isStaff ? "🛡️ Support" : "👤 Vous"}
                    </div>
                    {msg.text}
                  </div>
                  <span className="text-[9px] text-white/10 mt-2 font-mono">{msg.timestamp?.toDate().toLocaleTimeString()}</span>
                </div>
              ))}
            </div>

            {/* Input Area */}
            <form onSubmit={handleSendMessage} className="p-8 border-t border-white/5 bg-black/40">
              <div className="relative">
                <input 
                  type="text" 
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  placeholder="Tapez votre message..."
                  disabled={ticket.status === 'FERMÉ'}
                  className="w-full bg-white/5 border border-white/10 rounded-2xl py-5 px-8 pr-16 text-sm focus:outline-none focus:border-cyan-400/30 transition-all font-medium disabled:opacity-50"
                />
                <button 
                  type="submit"
                  disabled={!newMessage.trim() || ticket.status === 'FERMÉ'}
                  className="absolute right-3 top-1/2 -translate-y-1/2 w-12 h-12 rounded-xl violet-blue-glow-btn flex items-center justify-center transition-all hover:scale-110 active:scale-95 disabled:opacity-50"
                >
                  <Send size={20} />
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    );
  };

  const PackManagement = () => {
    const packsData = [
      { id: '1', user: 'lucas_dev', pack: 'EXTRA', status: 'PENDING', date: '19/04/2026', desc: 'Bot de modération avancée avec logs.' },
      { id: '2', user: 'sarah_web', pack: 'SUR_MESURE', status: 'APPROVED', date: '18/04/2026', desc: 'Système d\'économie complet pour serveur RP.' },
      { id: '3', user: 'thomas_01', pack: 'FREE', status: 'REJECTED', date: '17/04/2026', desc: 'Bot de bienvenue simple.' },
    ];

    return (
      <div className="min-h-screen bg-transparent pt-32 pb-20 px-6 relative overflow-hidden">
        {/* Glow Effects */}
        <div className="fixed inset-0 pointer-events-none">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[1000px] h-[1000px] bg-purple-600/10 blur-[250px] rounded-full" />
        </div>

        <div className="max-w-6xl mx-auto space-y-12 relative z-10">
          <header className="flex items-center justify-between">
            <div className="space-y-2">
              <h1 className="text-4xl font-display font-bold text-white tracking-widest italic">GESTION DES PACKS</h1>
              <p className="text-white/40 font-medium tracking-tight">Vérifiez et contrôlez le flux des commandes.</p>
            </div>
            <button 
              onClick={() => setView('staff-dashboard')}
              className="px-8 py-4 glass text-[11px] font-black uppercase tracking-widest hover:bg-white/10 transition-all border-white/5"
            >
              Retour dashboard
            </button>
          </header>

          <div className="glass bg-black/60 backdrop-blur-[15px] p-10 rounded-[2.5rem] border border-purple-500/20 shadow-[0_0_50px_rgba(168,85,247,0.1)] relative">
            {/* Fine purple light edge */}
            <div className="absolute inset-x-10 -top-[1px] h-[1px] bg-gradient-to-r from-transparent via-purple-500/50 to-transparent shadow-[0_0_15px_rgba(168,85,247,0.8)]" />
            
            <div className="space-y-6">
              {packsData.map((pkg) => (
                <div key={pkg.id} className="glass p-8 rounded-3xl border-white/5 flex flex-col md:flex-row items-center justify-between gap-8 group hover:bg-white/[0.03] transition-all">
                  <div className="flex-1 space-y-3">
                    <div className="flex items-center gap-4">
                      <h3 className="text-2xl font-display font-bold text-white tracking-tight">{pkg.pack}</h3>
                      <div className={cn(
                        "px-4 py-1.5 rounded-full text-[9px] font-black uppercase tracking-widest border",
                        pkg.status === 'PENDING' ? "border-amber-500/50 text-amber-500 shadow-[0_0_15px_rgba(245,158,11,0.2)]" :
                        pkg.status === 'APPROVED' ? "bg-emerald-500 text-black border-emerald-500 shadow-[0_0_20px_rgba(16,185,129,0.4)]" :
                        "bg-red-500 text-white border-red-500 shadow-[0_0_20px_rgba(239,68,68,0.4)]"
                      )}>
                        {pkg.status === 'PENDING' ? 'En attente' : pkg.status === 'APPROVED' ? 'Approuvé' : 'Refusé'}
                      </div>
                    </div>
                    <p className="text-white/40 text-sm font-medium leading-relaxed max-w-xl">{pkg.desc}</p>
                    <div className="flex items-center gap-6 text-[10px] font-bold uppercase tracking-[0.2em] text-white/20">
                      <span>👤 {pkg.user}</span>
                      <span>📅 {pkg.date}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-4">
                    <button className="px-10 py-4 rounded-xl text-[10px] font-black uppercase tracking-[0.2em] transition-all hover:scale-105 hover:bg-white/5 border border-red-500/40 text-red-500 group-hover:border-red-500">
                      Refuser
                    </button>
                    <button className="px-10 py-4 rounded-xl text-[10px] font-black uppercase tracking-[0.2em] bg-gradient-to-r from-emerald-500 via-teal-500 to-cyan-500 text-black shadow-[inset_0_2px_10px_rgba(255,255,255,0.3),0_15px_30px_rgba(16,185,129,0.2)] transition-all hover:scale-110 active:scale-95">
                      Approuver
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  };

  const TransactionTracking = () => {
    const transactions = [
      { id: 'TRX-9921', user: 'kento_01', packs: 'Pack EXTRA', amount: '29.99€', date: '19/04/2026', status: 'SUCCESS' },
      { id: 'TRX-8842', user: 'mira_dev', packs: 'Sur Mesure', amount: '149.00€', date: '18/04/2026', status: 'PENDING' },
      { id: 'TRX-7733', user: 'bob_bot', packs: 'Pack EXTRA', amount: '29.99€', date: '18/04/2026', status: 'FAILED' },
    ];

    return (
      <div className="min-h-screen bg-transparent pt-32 pb-20 px-6 relative overflow-hidden">
        {/* Gold Light Accents */}
        <div className="fixed inset-0 pointer-events-none">
          <div className="absolute top-0 right-0 w-[600px] h-[600px] bg-amber-500/5 blur-[150px] rounded-full" />
          <div className="absolute bottom-0 left-0 w-[600px] h-[600px] bg-yellow-600/5 blur-[150px] rounded-full" />
        </div>

        <div className="max-w-7xl mx-auto space-y-12 relative z-10">
          <header className="flex items-center justify-between">
            <h1 className="text-4xl font-display font-bold text-white tracking-widest italic">SUIVI DES TRANSACTIONS</h1>
            <button 
              onClick={() => setView('staff-dashboard')}
              className="px-8 py-4 glass text-[11px] font-black uppercase tracking-widest hover:bg-white/10 transition-all border-white/5"
            >
              Retour dashboard
            </button>
          </header>

          <div className="glass bg-black/80 backdrop-blur-3xl rounded-[2.5rem] border border-white/10 overflow-hidden shadow-[0_50px_100px_rgba(0,0,0,0.8)] relative">
            {/* Gold neon corners */}
            <div className="absolute top-0 left-0 w-32 h-32 border-t-2 border-l-2 border-amber-500/40 rounded-tl-[2.5rem]" />
            <div className="absolute top-0 right-0 w-32 h-32 border-t-2 border-r-2 border-amber-500/40 rounded-tr-[2.5rem]" />
            
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-white/5 bg-white/[0.02]">
                    <th className="px-10 py-8 text-[11px] font-black uppercase tracking-[0.3em] text-amber-400">ID TRANSACTION</th>
                    <th className="px-10 py-8 text-[11px] font-black uppercase tracking-[0.3em] text-amber-400">UTILISATEUR</th>
                    <th className="px-10 py-8 text-[11px] font-black uppercase tracking-[0.3em] text-amber-400">PACKS</th>
                    <th className="px-10 py-8 text-[11px] font-black uppercase tracking-[0.3em] text-amber-400">MONTANT</th>
                    <th className="px-10 py-8 text-[11px] font-black uppercase tracking-[0.3em] text-amber-400">DATE</th>
                    <th className="px-10 py-8 text-[11px] font-black uppercase tracking-[0.3em] text-amber-400 text-center">STATUT</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.03]">
                  {transactions.map((trx) => (
                    <tr key={trx.id} className="hover:bg-white/[0.01] transition-all group">
                      <td className="px-10 py-8 font-mono text-sm text-[off-white]/60">{trx.id}</td>
                      <td className="px-10 py-8 font-medium text-[off-white]/80">{trx.user}</td>
                      <td className="px-10 py-8 font-medium text-[off-white]/80">{trx.packs}</td>
                      <td className="px-10 py-8 font-bold text-amber-400 tracking-tight text-lg">{trx.amount}</td>
                      <td className="px-10 py-8 text-[off-white]/40 text-xs font-bold">{trx.date}</td>
                      <td className="px-10 py-8">
                        <div className="flex justify-center">
                          <div className={cn(
                            "px-5 py-2 rounded-full text-[10px] font-black uppercase tracking-widest border",
                            trx.status === 'SUCCESS' ? "bg-emerald-500 text-black border-emerald-400 shadow-[0_0_15px_rgba(16,185,129,0.3)]" :
                            trx.status === 'PENDING' ? "border-amber-500/50 text-amber-500" :
                            "bg-red-500 text-white border-red-500 shadow-[0_0_15px_rgba(239,68,68,0.3)]"
                          )}>
                            {trx.status === 'SUCCESS' ? 'Réussi' : trx.status === 'PENDING' ? 'En attente' : 'Échoué'}
                          </div>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="p-12 flex justify-center bg-white/[0.01]">
              <button className="px-20 py-6 rounded-2xl bg-gradient-to-r from-amber-400 via-yellow-500 to-amber-600 text-black font-black uppercase tracking-[0.3em] text-xs flex items-center gap-6 shadow-[0_20px_40px_rgba(245,158,11,0.2),inset_0_2px_10px_rgba(255,255,255,0.4)] transition-all hover:scale-105 active:scale-95 group">
                <Zap className="text-black group-hover:animate-bounce" size={22} />
                Voir les détails
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const Dashboard = () => (
    <div className="pt-32 pb-20 px-8 max-w-[1400px] mx-auto space-y-16 relative">
      {/* Volumetric Light Effects */}
      <div className="absolute -top-40 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-indigo-600/10 blur-[150px] rounded-full pointer-events-none" />
      
      {/* Header Area */}
      <div className="flex flex-col lg:flex-row justify-between items-start gap-12 relative z-10">
        <motion.div 
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-6"
        >
          <div className="flex items-center gap-6">
            <h1 className="text-5xl md:text-6xl font-display font-medium tracking-tight text-white italic">
              Ravi de vous revoir, <span className="font-bold led-cyan">{user?.email?.split('@')[0]} !</span>
            </h1>
            <motion.div
              animate={{ 
                rotate: [0, 20, 0],
                scale: [1, 1.2, 1],
                filter: ["drop-shadow(0 0 0px rgba(34,211,238,0))", "drop-shadow(0 0 20px rgba(34,211,238,0.5))", "drop-shadow(0 0 0px rgba(34,211,238,0))"]
              }}
              transition={{ duration: 3, repeat: Infinity }}
              className="text-6xl select-none cursor-default filter drop-shadow-2xl"
            >
              👋
            </motion.div>
          </div>
          <p className="text-white/40 text-xl font-medium tracking-[0.05em] uppercase">
            Votre centre de contrôle est opérationnel. Prêt à forger ?
          </p>
        </motion.div>

        {/* Level Indicator: Military Grade LED */}
        <motion.div 
          initial={{ opacity: 0, x: 40 }}
          animate={{ opacity: 1, x: 0 }}
          className="w-full lg:w-[450px] p-8 brushed-metal rounded-[2.5rem] border border-white/10 relative overflow-hidden"
        >
          <div className="flex items-center justify-between mb-6 relative z-10">
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 rounded-xl bg-orange-500/10 flex items-center justify-center border-2 border-orange-500/30 shadow-[0_0_15px_rgba(249,115,22,0.2)]">
                <Trophy size={20} className="text-orange-400" />
              </div>
              <div className="flex flex-col">
                <span className="text-[10px] font-black text-white/30 tracking-[0.2em] font-mono leading-none mb-1">UNIT STATUS</span>
                <span className="text-xs font-black uppercase tracking-[0.15em] text-white/90">NIVEAU 4 : FORGERON D'ÉLITE</span>
              </div>
            </div>
            <div className="text-right">
              <span className="text-[10px] font-mono text-white/30 tracking-widest font-black block mb-0.5 uppercase">Sync XP</span>
              <span className="text-sm font-mono text-pink-400 tracking-tighter font-black">750 / 1000 XP</span>
            </div>
          </div>
          <div className="h-4 bg-black/60 rounded-sm overflow-hidden border border-white/5 p-0.5 relative z-10 shadow-inner">
            <motion.div 
              initial={{ width: 0 }}
              animate={{ width: '75%' }}
              transition={{ duration: 2, ease: "easeOut" }}
              className="h-full bg-gradient-to-r from-purple-600 via-pink-600 to-red-600 shadow-[0_0_20px_rgba(236,72,153,0.5)] flex"
            >
              <div className="h-full w-full bg-[repeating-linear-gradient(90deg,transparent,transparent_4px,rgba(0,0,0,0.3)_4px,rgba(0,0,0,0.3)_6px)]" />
            </motion.div>
          </div>
          <div className="absolute top-0 right-0 w-48 h-48 bg-pink-500/5 blur-[80px] -z-0" />
        </motion.div>
      </div>

      {/* Stats Grid: 3D Floating Glass Tiles */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-8">
        {[
          { label: "BOTS TOTAUX", value: bots.length, icon: <BotIcon size={24} />, color: "text-cyan-400", style: "border-cyan-500/20 shadow-cyan-500/10" },
          { label: "EN LIGNE", value: bots.filter(b => b.status === 'online').length, icon: <Activity size={24} />, color: "text-emerald-400", style: "border-emerald-500/20 shadow-emerald-500/10" },
          { label: "COMMANDES", value: bots.length * 12 + 5, icon: <Terminal size={24} />, color: "text-purple-400", style: "border-purple-500/20 shadow-purple-500/10" },
          { label: "BADGES", value: 3, icon: <Star size={24} />, color: "text-amber-400", style: "border-amber-500/20 shadow-amber-500/10" }
        ].map((stat, i) => (
          <motion.div 
            key={stat.label}
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.2 + i * 0.1 }}
            whileHover={{ y: -10, rotateX: -2 }}
            className={cn(
              "p-8 glass rounded-[3rem] transition-all duration-500 group relative cockpit-card",
              stat.style
            )}
          >
            <div className={cn("w-14 h-14 rounded-2xl bg-black/40 flex items-center justify-center mb-8 border border-white/10 group-hover:scale-110 transition-transform", stat.color)}>
              {stat.icon}
            </div>
            <div className="text-5xl font-bold tracking-tighter mb-2 font-display led-cyan">{stat.value}</div>
            <div className="text-[11px] font-black text-white/30 tracking-[0.3em] font-mono group-hover:text-white/60 transition-colors uppercase">{stat.label}</div>
            <div className="absolute -bottom-4 -right-4 w-24 h-24 bg-white/5 blur-3xl opacity-0 group-hover:opacity-100 transition-opacity rounded-full" />
          </motion.div>
        ))}
      </div>

      <div className="grid lg:grid-cols-3 gap-12 items-start relative z-10">
        {/* Main Section */}
        <div className="lg:col-span-2 space-y-10">
          <div className="flex items-center justify-between">
            <h2 className="text-3xl font-display font-bold text-white tracking-tight italic">Vos Créations</h2>
            <button 
              onClick={handleNewBot}
              className="px-8 py-3.5 brushed-metal hover:bg-white hover:text-black rounded-2xl text-sm font-black uppercase tracking-widest transition-all inline-flex items-center gap-3 shadow-[0_0_30px_rgba(79,70,229,0.3)] hover:shadow-[0_0_40px_rgba(79,70,229,0.5)] border-indigo-500/30"
            >
              <Plus size={20} className="text-indigo-400 group-hover:text-black" /> Nouveau
            </button>
          </div>

          <div className="space-y-6">
            {bots.length === 0 ? (
              <motion.div className="py-24 text-center glass rounded-[4rem] border-dashed border-white/10 space-y-8">
                <div className="w-24 h-24 bg-white/[0.03] rounded-[2.5rem] flex items-center justify-center mx-auto border-2 border-white/5">
                  <BotIcon className="text-white/10" size={48} />
                </div>
                <div className="max-w-xs mx-auto space-y-3">
                  <h3 className="text-2xl font-bold text-white/80">Forge Inactive</h3>
                  <p className="text-sm text-white/30 leading-relaxed uppercase tracking-wider">Aucun système détecté. Initialisation requise.</p>
                </div>
                <button 
                  onClick={handleNewBot} 
                  className="px-10 py-4 brushed-metal rounded-2xl text-xs font-black uppercase tracking-[0.2em] hover:bg-white hover:text-black transition-all"
                >
                  Démarrer la séquence
                </button>
              </motion.div>
            ) : (
              <div className="grid gap-6">
                {bots.map((bot) => (
                  <motion.div 
                    key={bot.id}
                    layoutId={`bot-${bot.id}`}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    className="p-10 glass rounded-[3rem] group hover:border-white/20 transition-all relative overflow-hidden"
                  >
                    <div className="flex flex-col md:flex-row items-center justify-between gap-8 relative z-10">
                      <div className="flex items-center gap-8">
                        <div className="w-20 h-20 rounded-[2rem] bg-indigo-600/10 border-2 border-indigo-500/20 flex items-center justify-center shadow-[0_0_30px_rgba(99,102,241,0.1)] group-hover:scale-105 transition-transform">
                          <Hexagon size={40} className="text-indigo-400 stroke-[1.2px]" />
                        </div>
                        <div className="space-y-2">
                          <div className="flex items-center gap-4">
                            <h3 className="text-2xl font-bold text-white tracking-tight uppercase">{bot.name}</h3>
                            <div className={cn(
                              "px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-[0.1em] border flex items-center gap-2",
                              bot.status === 'online' ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" : "bg-white/5 text-white/20 border-white/5"
                            )}>
                              <div className={cn("w-1.5 h-1.5 rounded-full", bot.status === 'online' ? "bg-emerald-400 animate-pulse" : "bg-white/20")} />
                              {bot.status === 'online' ? '• ONLINE' : 'OFFLINE'}
                            </div>
                          </div>
                          <div className="flex items-center gap-4">
                            <span className="text-[10px] font-black text-indigo-400 uppercase tracking-widest bg-indigo-400/5 px-3 py-1.5 rounded-lg border border-indigo-400/10">
                              {bot.language}
                            </span>
                            <span className="text-[10px] text-white/20 uppercase font-bold tracking-widest">ID: {bot.id?.slice(0, 8)}</span>
                          </div>
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-4 w-full md:w-auto">
                        <button 
                          onClick={() => { setCurrentBot(bot); setView('editor'); }}
                          className="flex-1 md:w-32 py-4 bg-black/60 hover:bg-white hover:text-black rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] transition-all border border-white/5"
                        >
                          Gérer
                        </button>
                        <button 
                          onClick={() => toggleBotStatus(bot)}
                          className={cn(
                            "p-4 rounded-2xl transition-all border shadow-xl shadow-black/40",
                            bot.status === 'online' ? "bg-orange-500/10 text-orange-500 border-orange-500/20" : "bg-emerald-500/10 text-emerald-500 border-emerald-500/20"
                          )}
                        >
                          {bot.status === 'online' ? <Square size={20} /> : <Play size={20} />}
                        </button>
                        <button 
                          onClick={() => deleteBot(bot.id as string)}
                          className="p-4 rounded-2xl bg-white/[0.03] hover:bg-red-500/20 text-white/20 hover:text-red-400 transition-all border border-white/5"
                        >
                          <Trash2 size={20} />
                        </button>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Side Panels */}
        <div className="space-y-10">
          {/* Suggestions */}
          <section className="p-10 glass rounded-[4rem] relative overflow-hidden group">
            <h3 className="text-xl font-display font-bold text-white mb-10 flex items-center gap-4 uppercase tracking-[0.1em]">
              <div className="w-10 h-10 rounded-[1.25rem] bg-cyan-500/10 flex items-center justify-center border border-cyan-500/20">
                <Lightbulb size={20} className="text-cyan-400" />
              </div>
              Suggestions IA
            </h3>
            
            <div className="space-y-5 relative z-10">
              {[
                { title: "Bot de Sondages", desc: "Engagement communautaire.", icon: <TrendingUp size={18} />, color: "text-cyan-400" },
                { title: "Système de Niveaux", desc: "Gamification et récompenses.", icon: <Award size={18} />, color: "text-indigo-400" },
                { title: "Logs de Sécurité", desc: "Audit temps-réel avancé.", icon: <Shield size={18} />, color: "text-emerald-400" }
              ].map((sug) => (
                <button 
                  key={sug.title}
                  onClick={() => { setPrompt(sug.title + ": " + sug.desc); setView('generator'); }}
                  className="w-full text-left p-6 rounded-[2rem] bg-white/[0.02] hover:bg-white/[0.05] border border-white/5 hover:border-indigo-500/30 transition-all group flex gap-5"
                >
                  <div className={cn("w-12 h-12 rounded-2xl bg-black/40 flex items-center justify-center border border-white/5 transition-transform group-hover:scale-110", sug.color)}>
                    {sug.icon}
                  </div>
                  <div>
                    <div className="font-bold text-base text-white/90 mb-1">{sug.title}</div>
                    <p className="text-[10px] font-black uppercase tracking-[0.1em] text-white/20 group-hover:text-white/40 transition-colors uppercase">{sug.desc}</p>
                  </div>
                </button>
              ))}
            </div>
            <div className="absolute -top-10 -right-10 w-40 h-40 bg-cyan-500/5 blur-[60px] rounded-full group-hover:bg-cyan-500/10 transition-colors" />
          </section>

          {/* Notifications */}
          <section className="p-10 glass rounded-[4rem]">
            <h3 className="text-xl font-display font-bold text-white mb-10 flex items-center gap-4 uppercase tracking-[0.1em]">
              <div className="w-10 h-10 rounded-[1.25rem] bg-pink-500/10 flex items-center justify-center border border-pink-500/20">
                <Bell size={20} className="text-pink-400" />
              </div>
              Derniers Events
            </h3>
            
            <div className="space-y-5">
              <motion.div whileHover={{ x: 5 }} className="p-6 rounded-[2rem] bg-emerald-500/5 border border-emerald-500/20 flex gap-5">
                <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 flex items-center justify-center border border-emerald-500/20 shrink-0">
                  <Sparkles size={20} className="text-emerald-400" />
                </div>
                <p className="text-xs font-medium leading-relaxed self-center text-emerald-400/80 tracking-wide">
                  🎉 Votre bot <span className="font-black text-white/90 italic">Modérateur Pro</span> a été synchronisé.
                </p>
              </motion.div>

              <motion.div whileHover={{ x: 5 }} className="p-6 rounded-[2rem] bg-indigo-500/5 border border-indigo-500/20 flex gap-5">
                <div className="w-12 h-12 rounded-2xl bg-indigo-500/10 flex items-center justify-center border border-indigo-500/20 shrink-0">
                  <Trophy size={20} className="text-indigo-400" />
                </div>
                <p className="text-xs font-medium leading-relaxed self-center text-indigo-400/80 tracking-wide">
                  🏆 Nouveau badge : <span className="font-black text-white/90 italic">Premier Script</span> débloqué.
                </p>
              </motion.div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );

  const Generator = () => (
    <div className="pt-32 pb-20 px-6 max-w-4xl mx-auto space-y-12">
      {/* Header section with subtle glow */}
      <div className="text-center space-y-4">
        <motion.h1 
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-5xl md:text-6xl font-display font-medium tracking-tight text-white drop-shadow-[0_0_15px_rgba(255,255,255,0.2)]"
        >
          Générateur de Bot
        </motion.h1>
        <motion.p 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2 }}
          className="text-white/40 text-lg font-medium italic tracking-wide"
        >
          Décrivez les fonctionnalités que vous souhaitez pour votre bot.
        </motion.p>
      </div>

      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="generator-panel p-10 md:p-12 relative overflow-hidden backdrop-blur-3xl"
      >
        {/* Fine cyan lightline detail */}
        <div className="absolute inset-0 pointer-events-none rounded-[3rem] border border-cyan-400/20" />
        
        {genError && (
          <div className="mb-10 p-6 rounded-2xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm flex items-center gap-4 shadow-[0_0_20px_rgba(239,68,68,0.1)]">
            <Shield size={22} className="shrink-0" />
            <span className="font-medium tracking-wide">{genError}</span>
          </div>
        )}

        <div className="space-y-12">
          {/* Programming Language Selector */}
          <div className="space-y-6">
            <label className="block text-[10px] font-black text-white/30 uppercase tracking-[0.25em] ml-1">Système de Programmation</label>
            <div className="grid grid-cols-2 gap-6">
              {[
                { id: 'javascript', label: 'JavaScript (discord.js)', icon: <Code size={24} />, color: "purple" },
                { id: 'python', label: 'Python (discord.py)', icon: <Terminal size={24} />, color: "gray" }
              ].map((lang) => (
                <button 
                  key={lang.id}
                  onClick={() => setLanguage(lang.id as any)}
                  className={cn(
                    "p-8 rounded-[2rem] border-2 flex flex-col items-center justify-center gap-5 transition-all relative group h-40",
                    language === lang.id 
                      ? "bg-purple-900/10 border-purple-500/40 text-white shadow-[0_0_30px_rgba(168,85,247,0.15)]" 
                      : "bg-black/40 border-white/5 text-white/20 hover:border-white/10"
                  )}
                >
                  <div className={cn(
                    "w-14 h-14 rounded-2xl bg-black/60 flex items-center justify-center border border-white/5 transition-transform group-hover:scale-110",
                    language === lang.id ? "text-purple-400" : "text-white/10"
                  )}>
                    {lang.icon}
                  </div>
                  <span className={cn("text-xs font-black uppercase tracking-widest", language === lang.id ? "text-white" : "text-white/20")}>
                    {lang.label}
                  </span>
                  {language === lang.id && (
                    <div className="absolute inset-0 bg-purple-500/5 blur-2xl rounded-full pointer-events-none" />
                  )}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-12">
            {/* Token Input */}
            <div className="space-y-4">
              <div className="flex items-center justify-between ml-1">
                <label className="block text-[10px] font-black text-white/30 uppercase tracking-[0.25em]">Token du Bot Discord</label>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-black uppercase tracking-[0.2em] amber-glow animate-pulse">Confidentiel</span>
                  <Shield size={12} className="text-amber-500" />
                </div>
              </div>
              <div className="relative group">
                <input 
                  type="password"
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                  placeholder="MTAyNjg4OT..."
                  className="w-full bg-[#080808]/80 frosted-input-green border-2 border-white/5 rounded-2xl px-8 py-5 text-white placeholder:text-emerald-500/40 font-mono tracking-widest text-sm focus:outline-none focus:border-cyan-500/40 transition-all shadow-xl"
                />
                <div className="absolute inset-0 rounded-2xl border border-white/5 group-hover:border-white/10 pointer-events-none transition-colors" />
              </div>
              <div className="mt-4 text-[10px] text-white/20 italic font-medium px-1 flex items-center gap-2 uppercase tracking-tight">
                <div className="w-1.5 h-1.5 rounded-full bg-cyan-500/40" /> Crucial pour l'initiation du noyau. Sécurité garantie par cryptage quantique.
              </div>
            </div>

            {/* Description Input */}
            <div className="space-y-4">
              <label className="block text-[10px] font-black text-white/30 uppercase tracking-[0.25em] ml-1">
                Description du Bot 
                {(selectedPack === 'FREE' || selectedPack === 'EXTRA') && (
                  <span className="text-cyan-400 normal-case font-bold ml-3 tracking-normal opacity-60">
                    [ AUTO-FORGE: PACK {selectedPack} ACTIF ]
                  </span>
                )}
              </label>
              <div className="relative group">
                <textarea 
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  disabled={selectedPack === 'FREE' || selectedPack === 'EXTRA'}
                  placeholder="Ex: Un bot de modération d'élite avec des commandes tactiques /ban, /kick, un flux de logs temps-réel..."
                  className={cn(
                    "w-full h-56 textarea-midnight rounded-[2.5rem] p-8 text-white placeholder:text-white/10 focus:outline-none border-2 border-white/5 focus:border-cyan-500/40 transition-all resize-none font-medium leading-relaxed",
                    (selectedPack === 'FREE' || selectedPack === 'EXTRA') && "opacity-40 cursor-not-allowed italic text-white/20 border-white/5"
                  )}
                />
                <div className="absolute -bottom-px left-8 right-8 h-px bg-gradient-to-r from-transparent via-cyan-500/40 to-transparent opacity-0 group-focus-within:opacity-100 transition-opacity" />
              </div>
              
              {selectedPack !== 'FREE' && selectedPack !== 'EXTRA' && (
                <div className="mt-6 flex flex-wrap gap-3">
                  {["🛡️ Modération", "🎟️ Tickets", "🎵 Musique", "💎 Économie", "⚔️ RPG", "📊 Logs"].map((tag) => (
                    <button 
                      key={tag}
                      onClick={() => setPrompt(prev => prev + (prev ? ", " : "") + tag)}
                      className="px-5 py-2.5 rounded-xl bg-white/[0.03] border border-white/5 text-[10px] font-black uppercase tracking-widest text-white/40 hover:bg-white/10 hover:text-white hover:border-cyan-500/30 transition-all"
                    >
                      + {tag}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          <motion.button 
            whileHover={{ scale: 1.01 }}
            whileTap={{ scale: 0.98 }}
            onClick={handleGenerate}
            disabled={loading || (selectedPack !== 'FREE' && !prompt)}
            className="w-full py-7 generator-action-btn rounded-[2.5rem] font-bold text-2xl uppercase tracking-[0.2em] shadow-2xl disabled:opacity-40 disabled:grayscale transition-all flex items-center justify-center gap-5 relative overflow-hidden group"
          >
            {loading ? (
              <div className="flex items-center gap-4">
                <div className="w-8 h-8 border-4 border-white/20 border-t-white rounded-full animate-spin" />
                <span className="text-lg">SYNCHRONISATION...</span>
              </div>
            ) : (
              <>
                <Sparkles size={28} className="group-hover:rotate-12 transition-transform" /> 
                <span className="drop-shadow-[0_0_10px_rgba(255,255,255,0.4)]">Générer le bot</span>
              </>
            )}
            <div className="absolute inset-0 bg-white/10 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000 ease-in-out skew-x-[-20deg]" />
          </motion.button>
        </div>
      </motion.div>
    </div>
  );

  const Editor = () => (
    <div className="pt-24 h-screen flex flex-col bg-[#050505] selection:bg-indigo-500/30">
      {/* Control Bar */}
      <div className="px-8 py-5 backdrop-blur-xl bg-black/60 border-b border-white/5 flex items-center justify-between z-20 shadow-2xl">
        <div className="flex items-center gap-6">
          <button 
            onClick={() => setView('dashboard')} 
            className="w-10 h-10 flex items-center justify-center bg-white/5 hover:bg-white/10 rounded-xl transition-all border border-white/5 group"
          >
            <ChevronRight size={20} className="rotate-180 text-white/40 group-hover:text-white transition-colors" />
          </button>
          
          <div className="flex flex-col">
            <div className="flex items-center gap-3">
              <h2 className="text-xl font-display font-bold text-white tracking-tight">Pack EXTRA activé</h2>
              <div className={cn(
                "px-2.5 py-1 rounded-md text-[9px] font-black uppercase tracking-[0.2em] flex items-center gap-1.5 border",
                currentBot?.status === 'online' ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30 pulse-glow-green" : "bg-white/5 text-white/40 border-white/10"
              )}>
                <div className={cn("w-1.5 h-1.5 rounded-full", currentBot?.status === 'online' ? "bg-emerald-400" : "bg-white/20")} />
                {isBooting ? "INITIALISATION..." : "ONLINE"}
              </div>
            </div>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-[10px] font-mono font-bold text-white/30 uppercase tracking-widest">{currentBot?.language}</span>
              <span className="text-[10px] text-white/10 opacity-50">•</span>
              <span className="text-[10px] font-mono font-bold text-white/30 truncate max-w-[150px]">{currentBot?.name}</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex bg-white/5 rounded-xl p-1 border border-white/5 mr-2">
            {[
              { icon: <Copy size={16} />, onClick: copyToClipboard, label: "Copier" },
              { icon: <Download size={16} />, onClick: downloadCode, label: "Fichier" },
              { icon: <Plus size={16} />, onClick: downloadZip, label: "Pack ZIP" }
            ].map((btn, i) => (
              <button 
                key={i} 
                onClick={btn.onClick}
                className="p-2 text-white/40 hover:text-white hover:bg-white/5 rounded-lg transition-all"
                title={btn.label}
              >
                {btn.icon}
              </button>
            ))}
          </div>
          
          <button 
            onClick={() => currentBot && toggleBotStatus(currentBot)}
            disabled={isBooting}
            className={cn(
              "px-6 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest flex items-center gap-2 transition-all disabled:opacity-50 border",
              currentBot?.status === 'online' 
                ? "bg-gradient-to-br from-red-600 to-red-900 text-white border-red-500/30 shadow-lg shadow-red-900/20" 
                : "bg-gradient-to-br from-emerald-600 to-emerald-900 text-white border-emerald-500/30 shadow-lg shadow-emerald-900/20"
            )}
          >
            {isBooting ? (
              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : currentBot?.status === 'online' ? (
              <><Square size={14} className="fill-current" /> Arrêter</>
            ) : (
              <><Play size={14} className="fill-current" /> Lancer</>
            )}
          </button>
          
          <button 
            onClick={saveBotCode} 
            className="px-6 py-2.5 crystal-save rounded-xl text-xs font-black uppercase tracking-widest flex items-center gap-2"
          >
            <Save size={16} /> Sauvegarder
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-hidden flex flex-col lg:flex-row">
        {/* Editor Main Zone */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* File Tabs */}
          <div className="flex bg-[#0d0d0d] border-b border-white/5 px-4 h-12 items-end">
            {[
              { id: 'commands', label: currentBot?.language === 'javascript' ? 'commands.js' : 'commands.py', lang: 'js' },
              { id: 'main', label: currentBot?.language === 'javascript' ? 'main.js' : 'main.py', lang: 'js' },
              { id: 'package', label: currentBot?.language === 'javascript' ? 'package.json' : 'requirements.txt', lang: 'json' },
              { id: 'env', label: '.env', lang: 'env' },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveFile(tab.id as any)}
                className={cn(
                  "px-6 py-3 text-[10px] font-black uppercase tracking-widest flex items-center gap-3 transition-all relative border-t border-x border-transparent rounded-t-xl mx-0.5",
                  activeFile === tab.id 
                    ? "bg-[#050505] text-white border-white/5" 
                    : "text-white/20 hover:text-white/40 hover:bg-white/5"
                )}
              >
                {tab.lang === 'js' && <div className="w-2 h-2 rounded-full bg-yellow-400 shadow-[0_0_8px_rgba(250,204,21,0.5)]" />}
                {tab.lang === 'json' && <div className="w-2 h-2 rounded-full bg-blue-400 shadow-[0_0_8px_rgba(96,165,250,0.5)]" />}
                {tab.lang === 'env' && <div className="w-2 h-2 rounded-full bg-purple-400 shadow-[0_0_8px_rgba(192,132,252,0.5)]" />}
                {tab.label}
                {activeFile === tab.id && (
                  <motion.div 
                    layoutId="tab-glow" 
                    className="absolute bottom-0 left-4 right-4 h-[2px] bg-purple-500 shadow-[0_0_15px_rgba(168,85,247,0.8)]" 
                  />
                )}
              </button>
            ))}
          </div>

          {/* Syntax Highlighter View */}
          <div className="flex-1 overflow-auto bg-[#050505] recessed-editor relative">
            <div className="absolute left-0 top-0 bottom-0 w-12 bg-black/20 border-r border-white/5 z-0 pointer-events-none" />
            <SyntaxHighlighter 
              language={
                activeFile === 'package' ? (currentBot?.language === 'javascript' ? 'json' : 'text') :
                activeFile === 'env' ? 'bash' :
                (currentBot?.language === 'javascript' ? 'javascript' : 'python')
              } 
              style={vscDarkPlus}
              customStyle={{ 
                margin: 0, 
                padding: '2.5rem 1rem 2.5rem 3.5rem', 
                background: 'transparent', 
                fontSize: '14px', 
                lineHeight: '1.7',
                fontFamily: '"JetBrains Mono", monospace'
              }}
              showLineNumbers
              lineNumberStyle={{ 
                minWidth: '2.5rem', 
                paddingRight: '1rem', 
                color: 'rgba(255,255,255,0.1)', 
                textAlign: 'right',
                fontFamily: '"JetBrains Mono", monospace'
              }}
            >
              {activeFile === 'commands' ? currentBot?.code || '' :
               activeFile === 'main' ? currentBot?.architecture?.main || '' :
               activeFile === 'package' ? currentBot?.architecture?.package || '' :
               currentBot?.architecture?.env || ''}
            </SyntaxHighlighter>
          </div>
          
          {/* Matrix Console */}
          <div className="h-56 bg-black border-t border-white/5 flex flex-col shadow-2xl relative z-20">
            <div className="px-5 py-3 bg-[#0d0d0d] border-b border-white/5 flex items-center justify-between">
              <div className="flex items-center gap-3 text-[10px] font-black uppercase tracking-[0.2em] text-white/40">
                <Terminal size={12} className="text-cyan-400" /> Console de sortie
              </div>
              <button 
                onClick={() => setBotLogs([])} 
                className="text-[10px] font-bold text-white/20 hover:text-white transition-all uppercase tracking-widest px-3 py-1 hover:bg-white/5 rounded-md"
              >
                Effacer
              </button>
            </div>
            <div className="flex-1 overflow-auto p-6 matrix-console space-y-1.5 custom-scrollbar">
              {botLogs.length === 0 ? (
                <div className="text-emerald-500/20 italic font-mono flex items-center gap-2">
                  <div className="w-1.5 h-3 bg-emerald-500/40 animate-blink" /> En attente du lancement du bot...
                </div>
              ) : (
                botLogs.map((log, i) => (
                  <div key={i} className="font-mono">
                    <span className="opacity-20 mr-3 text-[10px] tracking-tighter">[{new Date().toLocaleTimeString()}]</span>
                    {log}
                  </div>
                ))
              )}
              {isBooting && (
                <div className="text-emerald-400 animate-pulse flex items-center gap-2 font-mono">
                  <div className="w-1.5 h-3 bg-emerald-400 animate-blink" /> ANALYZING SYSTEM CORE...
                </div>
              )}
            </div>
          </div>
        </div>
        
        {/* Right Configuration Panel */}
        <div className="w-96 backdrop-blur-3xl bg-[#080808]/80 border-l border-white/5 p-8 hidden lg:block overflow-auto custom-scrollbar space-y-10">
          <div>
            <div className="flex items-center gap-4 mb-8">
              <div className="w-10 h-10 rounded-xl bg-indigo-500/10 flex items-center justify-center border border-indigo-500/20 shadow-lg shadow-indigo-500/10">
                <Shield size={20} className="text-indigo-400" />
              </div>
              <h3 className="text-lg font-display font-bold text-white italic">Configuration</h3>
            </div>
            
            <div className="space-y-6">
              <div className="group">
                <label className="block text-[10px] font-black text-white/30 uppercase tracking-[0.2em] mb-3 ml-1">Token du Bot</label>
                <div className="relative">
                  <input 
                    type="password"
                    value={currentBot?.token || ''}
                    onChange={(e) => {
                      if (currentBot) {
                        const updatedBot = { ...currentBot, token: e.target.value };
                        setCurrentBot(updatedBot);
                        setBots(prev => prev.map(b => b.id === currentBot.id ? updatedBot : b));
                      }
                    }}
                    className="frosted-input w-full py-3.5 px-5 font-mono text-sm tracking-[0.3em] text-cyan-400"
                    placeholder="••••••••••••••••"
                  />
                  <div className="absolute right-4 top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full bg-cyan-400 shadow-[0_0_10px_rgba(34,211,238,0.8)] opacity-0 group-focus-within:opacity-100 transition-opacity" />
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-8">
            <div className="flex items-center gap-4 mb-2">
              <div className="w-10 h-10 rounded-xl bg-cyan-500/10 flex items-center justify-center border border-cyan-500/20 shadow-lg shadow-cyan-500/10">
                <Book size={20} className="text-cyan-400" />
              </div>
              <h3 className="text-lg font-display font-bold text-white italic">Aide & Astuces</h3>
            </div>

            <div className="space-y-6">
              {/* Neon Alert */}
              <div className="p-6 rounded-[2rem] neon-amber-alert border border-amber-500/30 relative overflow-hidden group"
              >
                <div className="flex gap-4 relative z-10">
                  <AlertTriangle size={20} className="text-amber-400 shrink-0 mt-0.5 group-hover:scale-110 transition-transform" />
                  <div className="text-[11px] text-amber-200/60 leading-relaxed font-medium">
                    <span className="font-black text-amber-400 block mb-1 uppercase tracking-widest">Avertissement</span>
                    Après le premier lancement, Discord peut avoir un délai (quelques minutes) pour afficher les Slash Commands. Redémarrez Discord pour forcer le refresh.
                  </div>
                </div>
                <div className="absolute -bottom-10 -right-10 w-24 h-24 bg-amber-500/5 blur-3xl rounded-full" />
              </div>

              {/* Next Steps */}
              <div className="space-y-5">
                <h4 className="text-[10px] font-black text-white/30 uppercase tracking-[0.2em] ml-1">Prochaines étapes</h4>
                <ul className="space-y-4">
                  {[
                    "Récuperez votre Token sur le Discord Portal.",
                    "Remplacez 'YOUR_TOKEN' par votre clé secrète.",
                    "Cliquez sur 'Lancer' pour animer le système."
                  ].map((step, i) => (
                    <li key={i} className="flex items-center gap-4 group">
                      <div className="bullet-glow-blue group-hover:scale-150 transition-transform" />
                      <span className="text-xs font-medium text-white/50 group-hover:text-white/80 transition-colors">{step}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Tip Card */}
              <motion.div 
                whileHover={{ y: -5 }}
                className="p-6 rounded-[2rem] bg-white/[0.02] border border-white/5 relative overflow-hidden group shadow-2xl"
              >
                <div className="flex gap-4 items-start relative z-10">
                  <div className="w-10 h-10 rounded-xl bg-purple-500/10 flex items-center justify-center border border-purple-500/20 shadow-[0_0_20px_rgba(168,85,247,0.2)] group-hover:shadow-[0_0_30px_rgba(168,85,247,0.4)] transition-all">
                    <Lightbulb size={18} className="text-purple-400" />
                  </div>
                  <div>
                    <span className="text-xs font-black text-purple-400 uppercase tracking-widest block mb-1">Astuce Pro</span>
                    <p className="text-[11px] text-white/40 leading-relaxed font-medium group-hover:text-white/50 transition-colors">
                      Si vous voyez l'erreur <code className="bg-white/5 px-1.5 py-0.5 rounded text-white/60">Module not found</code>, installez les dépendances via npm.
                    </p>
                  </div>
                </div>
                <div className="absolute -bottom-12 -right-12 w-32 h-32 bg-purple-500/5 blur-[50px] rounded-full pointer-events-none" />
              </motion.div>

              <div className="p-6 rounded-[2rem] bg-indigo-600/5 border border-indigo-500/10 text-center">
                <div className="text-[10px] text-indigo-300/60 font-black uppercase tracking-widest leading-relaxed italic">
                  Besoin d'une commande ?<br />
                  <span className="text-white/40 mt-1 block">Utilisez l'IA pour forger.</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  const PrivacyPolicy = () => {
    const [scrollProgress, setScrollProgress] = useState(0);

    useEffect(() => {
      const handleScroll = () => {
        const totalHeight = document.documentElement.scrollHeight - window.innerHeight;
        const progress = (window.scrollY / totalHeight) * 100;
        setScrollProgress(progress);
      };

      window.addEventListener('scroll', handleScroll);
      return () => window.removeEventListener('scroll', handleScroll);
    }, []);

    const sections = [
      { 
        id: 'collection', 
        title: 'Données collectées', 
        icon: <EyeOff size={24} />, 
        content: "Nous collectons uniquement les données strictement nécessaires au fonctionnement de vos bots : votre adresse email pour l'identification, et les tokens de bot que vous nous confiez. Vos données personnelles ne sont jamais vendues ni partagées avec des tiers." 
      },
      { 
        id: 'storage', 
        title: 'Stockage Sécurisé', 
        icon: <Database size={24} />, 
        content: "Nos serveurs utilisent des protocoles de cryptage de niveau industriel (AES-256) pour garantir l'intégrité de vos informations. Toutes les bases de données sont isolées et surveillées 24h/24 par nos systèmes de défense automatisés." 
      },
      { 
        id: 'tokens', 
        title: 'Cryptage des Tokens', 
        icon: <Lock size={24} />, 
        isSpecial: true,
        content: "Les Tokens de bots Discord sont des clés d'accès critiques. C'est pourquoi ils sont cryptés avant stockage et ne sont jamais enregistrés en clair dans notre base de données. Seul le processus d'exécution peut les déchiffrer temporairement lors de la connexion." 
      },
      { 
        id: 'transparency', 
        title: 'Transparence', 
        icon: <Globe size={24} />, 
        content: "Vous disposez d'un droit d'accès, de rectification et de suppression totale de vos données à tout moment via votre tableau de bord. La suppression d'un compte entraîne l'effacement immédiat et irréversible de toutes les données associées." 
      }
    ];

    return (
      <div className="pt-32 pb-20 px-6 max-w-5xl mx-auto space-y-16 relative">
        {/* Reading Progress Bar */}
        <div className="fixed top-0 left-0 right-0 h-1.5 z-[60] bg-black/40">
          <motion.div 
            className="h-full bg-cyan-400 shadow-[0_0_15px_rgba(34,211,238,0.8)]"
            initial={{ width: 0 }}
            animate={{ width: `${scrollProgress}%` }}
            transition={{ ease: "easeOut" }}
          />
        </div>

        {/* Background Hexagon Pattern & Scrolling Code */}
        <div className="fixed inset-0 -z-10 opacity-10 pointer-events-none overflow-hidden">
             <div className="absolute inset-0 hexagon-pattern" />
             <div className="absolute top-0 right-1/4 w-px h-full bg-gradient-to-b from-transparent via-cyan-500/20 to-transparent animate-pulse" />
             <div className="absolute top-0 left-1/3 w-px h-full bg-gradient-to-b from-transparent via-purple-500/20 to-transparent animate-pulse delay-700" />
        </div>

        <header className="text-center space-y-6">
          <div className="flex items-center justify-center gap-4">
             <motion.div 
                animate={{ scale: [1, 1.1, 1] }}
                transition={{ duration: 3, repeat: Infinity }}
                className="w-14 h-14 rounded-2xl bg-cyan-500/10 flex items-center justify-center border border-cyan-500/20 shadow-[0_0_20px_rgba(34,211,238,0.1)]"
             >
                <Shield className="text-cyan-400" size={28} />
             </motion.div>
             <h1 className="text-4xl md:text-6xl font-display font-medium tracking-tight text-white drop-shadow-[0_0_10px_rgba(255,255,255,0.1)]">
                Politique de Confidentialité
             </h1>
          </div>
          <p className="text-white/40 text-lg uppercase tracking-[0.3em] font-medium italic">
             Protection & Transparence Totale
          </p>
        </header>

        <div className="glass rounded-[2rem] border border-white/5 shadow-2xl relative overflow-hidden backdrop-blur-3xl">
           {/* Top corner highlights */}
           <div className="absolute top-0 left-0 w-24 h-24 bg-cyan-500/10 blur-3xl pointer-events-none" />
           <div className="absolute top-0 right-0 w-24 h-24 bg-purple-500/10 blur-3xl pointer-events-none" />
           
           <div className="p-10 md:p-16 space-y-12">
             {sections.map(s => (
               <motion.section 
                 key={s.id}
                 initial={{ opacity: 0, x: -20 }}
                 whileInView={{ opacity: 1, x: 0 }}
                 viewport={{ once: true }}
                 className={cn(
                   "p-8 rounded-3xl transition-all border group relative",
                   s.isSpecial 
                    ? "border-amber-500/30 bg-amber-500/[0.02]" 
                    : "border-transparent hover:border-white/5 hover:bg-white/[0.01]"
                 )}
               >
                 <div className="flex flex-col md:flex-row gap-8 items-start">
                    <div className={cn(
                        "w-12 h-12 rounded-xl flex items-center justify-center shrink-0 shadow-lg transition-transform group-hover:scale-110",
                        s.isSpecial ? "bg-amber-500/10 text-amber-500" : "bg-cyan-500/10 text-cyan-400"
                    )}>
                      {s.icon}
                    </div>
                    <div className="space-y-4">
                      <h3 className={cn("text-xl font-bold italic tracking-tight", s.isSpecial ? "text-amber-400" : "text-cyan-400")}>
                        {s.title}
                      </h3>
                      <p className="text-white/60 leading-relaxed text-lg font-medium">
                        {s.content}
                      </p>
                    </div>
                 </div>
                 {s.isSpecial && (
                    <div className="absolute top-4 right-8 text-[10px] font-black uppercase tracking-widest text-amber-500 opacity-40">
                      Top Secret
                    </div>
                 )}
               </motion.section>
             ))}

             <div className="pt-12 border-t border-white/5 flex flex-col md:flex-row items-center justify-between gap-8">
               <div className="flex items-center gap-4 text-white/40">
                 <ScrollText size={20} className="text-cyan-400" />
                 <span className="text-sm font-medium tracking-wide">Dernière mise à jour: 19 Avril 2026</span>
               </div>
               <button 
                onClick={() => setView('landing')}
                className="px-8 py-3 bg-white/5 border border-white/10 rounded-xl text-sm font-bold uppercase tracking-widest hover:bg-white/10 hover:border-cyan-500/30 transition-all text-white/60 hover:text-white"
               >
                 Retour à l'accueil
               </button>
             </div>
           </div>
        </div>
      </div>
    );
  };

  const TermsOfService = () => {
    const [accepted, setAccepted] = useState(false);
    const sections = [
      { id: 'accept', title: '1. Acceptation des termes', content: "En accédant et en utilisant la plateforme DiscordBot AI, vous acceptez d'être lié par les présentes Conditions d'Utilisation. Si vous n'acceptez pas ces conditions, veuillez ne pas utiliser nos services. Nous nous réservons le droit de modifier ces termes à tout moment sans préavis." },
      { id: 'use', title: '2. Utilisation du service', content: "DiscordBot AI fournit des outils pour générer et héberger des bots Discord. Vous êtes seul responsable du contenu et des actions de vos bots. L'utilisation de nos services pour des activités illégales, malveillantes ou violant les Conditions de Service de Discord est strictement interdite." },
      { id: 'account', title: '3. Comptes et Sécurité', content: "Vous êtes responsable du maintien de la confidentialité de vos identifiants de connexion. Toute activité se déroulant sous votre compte est sous votre entière responsabilité. Vous devez nous informer immédiatement de toute utilisation non autorisée de votre compte." },
      { id: 'host', title: '4. Hébergement et Disponibilité', content: "Bien que nous nous efforcions de maintenir une disponibilité maximale, DiscordBot AI ne garantit pas que le service sera ininterrompu ou sans erreur. Nous ne sommes pas responsables des pertes de données ou des interruptions de service causées par des tiers." },
      { id: 'limit', title: '5. Limitation de responsabilité', content: "Dans la mesure maximale permise par la loi, DiscordBot AI ne pourra être tenu responsable des dommages directs, indirects, accessoires ou consécutifs résultant de l'utilisation ou de l'impossibilité d'utiliser le service." },
    ];

    const scrollToSection = (id: string) => {
      const element = document.getElementById(id);
      if (element) {
        element.scrollIntoView({ behavior: 'smooth' });
      }
    };

    return (
      <div className="pt-32 pb-20 px-6 max-w-7xl mx-auto space-y-12">
        <header className="text-center space-y-4">
          <motion.h1 
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-5xl md:text-7xl font-display font-medium tracking-tight text-white italic drop-shadow-[0_0_20px_rgba(255,255,255,0.15)]"
          >
            Conditions d'Utilisation
          </motion.h1>
          <div className="w-64 h-1 bg-gradient-to-r from-cyan-400 to-transparent mx-auto rounded-full" />
        </header>

        <div className="flex flex-col lg:flex-row gap-12 items-start relative z-10">
          {/* Side Summary */}
          <aside className="w-full lg:w-64 sticky top-32 glass rounded-2xl p-8 hidden lg:block border border-white/5 backdrop-blur-xl">
            <h3 className="text-[10px] font-black text-white/30 uppercase tracking-[0.2em] mb-8 flex items-center gap-3">
              <List size={14} className="text-cyan-400" /> Sommaire
            </h3>
            <nav className="space-y-5">
              {sections.map(s => (
                <button
                  key={s.id}
                  onClick={() => scrollToSection(s.id)}
                  className="block text-xs font-bold text-white/40 hover:text-white transition-all text-left hover:translate-x-1 group"
                >
                  <span className="group-hover:text-cyan-400 group-hover:glow-cyan">{s.title.split('.')[1].trim()}</span>
                </button>
              ))}
            </nav>
          </aside>

          {/* Main Reading Panel */}
          <div className="flex-1 glass rounded-[3rem] p-1 border border-white/5 shadow-2xl relative overflow-hidden backdrop-blur-3xl min-h-[600px]">
             <div className="max-h-[750px] overflow-y-auto custom-scrollbar-cyan p-8 lg:p-16 space-y-16">
               {sections.map(s => (
                 <motion.section 
                   key={s.id}
                   id={s.id}
                   whileHover={{ backgroundColor: 'rgba(255,255,255,0.01)' }}
                   className="space-y-6 p-8 rounded-3xl border border-transparent hover:border-white/5 transition-all group"
                 >
                   <h3 className="text-2xl font-display font-bold text-cyan-400 italic tracking-tight">{s.title}</h3>
                   <div className="text-white/50 leading-relaxed font-medium text-base">
                     {s.content.split(' ').map((word, i) => {
                       const isKeyword = word.includes("responsable") || 
                                       word.includes("interdite") || 
                                       word.includes("DiscordBot AI") || 
                                       word.includes("responsabilité") || 
                                       word.includes("illegales");
                       return (
                         <span key={i} className={cn(isKeyword ? "text-white font-bold" : "")}>
                           {word}{' '}
                         </span>
                       );
                     })}
                   </div>
                 </motion.section>
               ))}
               
               {/* Validation Section */}
               <div className="pt-20 border-t border-white/10 space-y-10">
                 <div className="flex items-center gap-5 cursor-pointer group" onClick={() => setAccepted(!accepted)}>
                    <div className={cn(
                      "w-7 h-7 rounded-lg border-2 flex items-center justify-center transition-all",
                      accepted ? "bg-emerald-500 border-emerald-400 shadow-[0_0_20px_rgba(16,185,129,0.6)]" : "border-white/10 bg-white/5 group-hover:border-white/20"
                    )}>
                      {accepted && <Check size={16} className="text-white" />}
                    </div>
                    <span className="text-sm font-bold text-white/60 group-hover:text-white transition-colors uppercase tracking-widest">J'accepte les conditions d'utilisation</span>
                 </div>

                 <button 
                  disabled={!accepted}
                  onClick={() => setView('landing')}
                  className={cn(
                    "w-full py-6 rounded-[2rem] font-black uppercase tracking-[0.25em] transition-all text-xl shadow-2xl relative overflow-hidden group",
                    accepted 
                      ? "bg-gradient-to-r from-purple-600 to-indigo-600 hover:scale-[1.01] active:scale-[0.98] text-white opacity-100" 
                      : "bg-white/5 text-white/20 border border-white/5 opacity-50 cursor-not-allowed"
                  )}
                 >
                   <span className="relative z-10 transition-transform group-hover:scale-105 inline-block">Confirmer l'adhésion</span>
                   {accepted && <div className="absolute inset-0 bg-white/10 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000 ease-in-out skew-x-[-20deg]" />}
                 </button>
               </div>
             </div>
          </div>
        </div>
        
        {/* Background Depth Reflected Light */}
        <div className="fixed top-0 left-0 w-full h-full -z-10 pointer-events-none overflow-hidden">
          <div className="absolute -top-1/4 -left-1/4 w-1/2 h-1/2 bg-purple-600/5 blur-[150px] rounded-full" />
          <div className="absolute -bottom-1/4 -right-1/4 w-1/2 h-1/2 bg-cyan-600/5 blur-[150px] rounded-full" />
        </div>
      </div>
    );
  };

  const Auth = ({ mode }: { mode: 'login' | 'signup' }) => (
    <div className="pt-32 pb-20 px-6 flex items-center justify-center">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="w-full max-w-md glass rounded-3xl p-8 md:p-10"
      >
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-indigo-600 rounded-2xl flex items-center justify-center mx-auto mb-6 glow-primary">
            <BotIcon size={32} />
          </div>
          <h1 className="text-3xl font-display font-bold mb-2">{mode === 'login' ? 'Bon retour !' : 'Créer un compte'}</h1>
          <p className="text-white/50">{mode === 'login' ? 'Connectez-vous pour gérer vos bots.' : 'Rejoignez la révolution de l\'IA Discord.'}</p>
        </div>

        <form onSubmit={mode === 'login' ? handleLogin : handleSignup} className="space-y-4">
          {authError && <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm text-center">{authError}</div>}
          <div>
            <label className="block text-xs font-bold text-white/40 uppercase tracking-widest mb-2">Email</label>
            <input 
              type="email" 
              required
              value={authEmail}
              onChange={(e) => setAuthEmail(e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 focus:outline-none focus:border-indigo-500 transition-all"
              placeholder="votre@email.com"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-white/40 uppercase tracking-widest mb-2">Mot de passe</label>
            <input 
              type="password" 
              required
              value={authPassword}
              onChange={(e) => setAuthPassword(e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 focus:outline-none focus:border-indigo-500 transition-all"
              placeholder="••••••••"
            />
          </div>
          <button type="submit" className="w-full py-4 bg-indigo-600 rounded-xl font-bold glow-primary hover:bg-indigo-500 transition-all">
            {mode === 'login' ? 'Se connecter' : 'S\'inscrire'}
          </button>
        </form>

        <div className="mt-6 flex flex-col gap-3">
          <div className="flex items-center gap-4 my-2">
            <div className="h-[1px] flex-1 bg-white/10" />
            <span className="text-[10px] font-bold text-white/20 uppercase tracking-widest">Ou continuer avec</span>
            <div className="h-[1px] flex-1 bg-white/10" />
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <button 
              onClick={handleGoogleLogin}
              className="flex items-center justify-center gap-2 py-3 px-4 bg-white/5 border border-white/10 rounded-xl hover:bg-white/10 transition-all group"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24">
                <path
                  fill="#4285F4"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                />
                <path
                  fill="#34A853"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"
                />
                <path
                  fill="#EA4335"
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                />
              </svg>
              <span className="text-sm font-bold">Google</span>
            </button>
            <button 
              onClick={handleDiscordLogin}
              className="flex items-center justify-center gap-2 py-3 px-4 bg-white/5 border border-white/10 rounded-xl hover:bg-white/10 transition-all group"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" className="text-[#5865F2] group-hover:scale-110 transition-transform">
                <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515a.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0a12.64 12.64 0 0 0-.617-1.25a.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057a19.9 19.9 0 0 0 5.993 3.03a.078.078 0 0 0 .084-.028a14.09 14.09 0 0 0 1.226-1.994a.076.076 0 0 0-.041-.106a13.107 13.107 0 0 1-1.872-.892a.077.077 0 0 1-.008-.128a10.2 10.2 0 0 0 .372-.292a.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127a12.299 12.299 0 0 1-1.873.892a.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028a19.839 19.839 0 0 0 6.002-3.03a.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419c0-1.333.955-2.419 2.157-2.419c1.21 0 2.176 1.086 2.157 2.419c0 1.334-.956 2.419-2.157 2.419zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419c0-1.333.955-2.419 2.157-2.419c1.21 0 2.176 1.086 2.157 2.419c0 1.334-.946 2.419-2.157 2.419z"/>
              </svg>
              <span className="text-sm font-bold">Discord</span>
            </button>
          </div>
        </div>

        <div className="mt-8 text-center text-sm text-white/40">
          {mode === 'login' ? (
            <>Pas encore de compte ? <button onClick={() => setView('signup')} className="text-indigo-400 font-bold hover:underline">S'inscrire</button></>
          ) : (
            <>Déjà un compte ? <button onClick={() => setView('login')} className="text-indigo-400 font-bold hover:underline">Se connecter</button></>
          )}
        </div>
      </motion.div>
    </div>
  );

  const HostSelection = () => {
    const [sortBy, setSortBy] = useState('Popularité');
    const [selectedCategories, setSelectedCategories] = useState(['Gratuit (Free)']);
    const [budget, setBudget] = useState(60);
    
    const categories = ['Gratuit (Free)', 'Économique', 'Premium', 'Performance'];
    
    const hosts = [
      { id: 1, name: "Katabump Hosting", category: "Gratuit (Free)", ram: "1GB", cpu: "1 Core", storage: "5GB NVMe", price: 0, logo: "KB", color: "from-emerald-500/20 to-emerald-600/20", borderColor: "border-emerald-500/30", glow: "shadow-emerald-500/10", stats: { popularity: 98, perf: 85 } },
      { id: 2, name: "CyberCore Node", category: "Performance", ram: "16GB", cpu: "4 Cores", storage: "100GB NVMe", price: 29.99, logo: "CC", color: "from-cyan-500/20 to-cyan-600/20", borderColor: "border-cyan-500/30", glow: "shadow-cyan-500/10", stats: { popularity: 92, perf: 99 } },
      { id: 3, name: "EcoBot Server", category: "Économique", ram: "2GB", cpu: "1 Core", storage: "20GB SSD", price: 4.99, logo: "EB", color: "from-blue-500/20 to-blue-600/20", borderColor: "border-blue-500/30", glow: "shadow-blue-500/10", stats: { popularity: 88, perf: 70 } },
      { id: 4, name: "Vortex Cloud", category: "Premium", ram: "8GB", cpu: "2 Cores", storage: "50GB NVMe", price: 14.99, logo: "VC", color: "from-indigo-500/20 to-indigo-600/20", borderColor: "border-indigo-500/30", glow: "shadow-indigo-500/10", stats: { popularity: 95, perf: 90 } },
      { id: 5, name: "Titan Host", category: "Performance", ram: "32GB", cpu: "8 Cores", storage: "250GB NVMe", price: 59.99, logo: "TH", color: "from-purple-500/20 to-purple-600/20", borderColor: "border-purple-500/30", glow: "shadow-purple-500/10", stats: { popularity: 85, perf: 100 } },
      { id: 6, name: "Nebula Free", category: "Gratuit (Free)", ram: "512MB", cpu: "0.5 Core", storage: "2GB SSD", price: 0, logo: "NF", color: "from-gray-500/20 to-gray-600/20", borderColor: "border-gray-500/30", glow: "shadow-gray-500/10", stats: { popularity: 80, perf: 50 } },
    ];

    const toggleCategory = (cat: string) => {
      setSelectedCategories(prev => 
        prev.includes(cat) ? prev.filter(c => c !== cat) : [...prev, cat]
      );
    };

    const sortedHosts = [...hosts]
      .filter(h => selectedCategories.length === 0 || selectedCategories.includes(h.category))
      .filter(h => h.price <= budget)
      .sort((a, b) => {
        if (sortBy === 'Prix') return a.price - b.price;
        if (sortBy === 'Popularité') return b.stats.popularity - a.stats.popularity;
        if (sortBy === 'Performance') return b.stats.perf - a.stats.perf;
        return 0;
      });

    return (
      <div className="pt-32 pb-20 px-6 max-w-7xl mx-auto space-y-12 relative">
        {/* Background Gradients */}
        <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-cyan-600/5 blur-[120px] rounded-full pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-[500px] h-[500px] bg-purple-600/5 blur-[120px] rounded-full pointer-events-none" />

        <header className="flex flex-col md:flex-row items-center gap-6 relative z-10">
          <div className="w-16 h-16 rounded-2xl bg-cyan-500/10 flex items-center justify-center border border-cyan-500/20 shadow-[0_0_20px_rgba(6,182,212,0.15)] animate-pulse">
            <Server className="text-cyan-400" size={32} />
          </div>
          <div className="text-center md:text-left">
            <h1 className="text-5xl font-display font-bold tracking-tighter bg-gradient-to-r from-white to-white/60 bg-clip-text text-transparent italic">
              Hébergeurs Fiables
            </h1>
            <p className="text-white/40 text-lg uppercase tracking-widest font-medium mt-1">Sélection d'Hébergeurs Partenaires</p>
          </div>
        </header>

        {/* Filters Panel */}
        <section className="backdrop-blur-xl bg-white/5 border border-white/10 rounded-[2rem] p-8 shadow-2xl relative z-10">
          <div className="grid lg:grid-cols-3 gap-10 items-center">
            {/* Sorting */}
            <div className="space-y-3">
              <label className="text-xs font-mono text-white/40 uppercase tracking-widest flex items-center gap-2">
                <SlidersHorizontal size={14} /> Trier Par
              </label>
              <div className="flex gap-2 p-1 bg-black/40 border border-white/5 rounded-xl">
                {['Popularité', 'Prix', 'Performance'].map(option => (
                  <button
                    key={option}
                    onClick={() => setSortBy(option)}
                    className={cn(
                      "flex-1 py-2 text-xs font-bold rounded-lg transition-all",
                      sortBy === option ? "bg-cyan-500 text-black shadow-lg shadow-cyan-500/20" : "text-white/40 hover:text-white"
                    )}
                  >
                    {option}
                  </button>
                ))}
              </div>
            </div>

            {/* Price Slider */}
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <label className="text-xs font-mono text-white/40 uppercase tracking-widest">Budget Max</label>
                <span className="text-sm font-bold text-cyan-400">{budget}€ / mois</span>
              </div>
              <div className="relative h-6 flex items-center">
                <input 
                  type="range" 
                  min="0" 
                  max="100" 
                  value={budget} 
                  onChange={(e) => setBudget(parseInt(e.target.value))}
                  className="w-full h-1.5 bg-white/10 rounded-full appearance-none cursor-pointer accent-cyan-400"
                />
                <div 
                  className="absolute h-1.5 bg-cyan-400/50 rounded-full pointer-events-none" 
                  style={{ width: `${budget}%` }}
                />
              </div>
            </div>

            {/* Categories */}
            <div className="space-y-3">
              <label className="text-xs font-mono text-white/40 uppercase tracking-widest flex items-center gap-2">
                <Filter size={14} /> Catégories
              </label>
              <div className="flex flex-wrap gap-2">
                {categories.map(cat => (
                  <button
                    key={cat}
                    onClick={() => toggleCategory(cat)}
                    className={cn(
                      "px-4 py-2 rounded-xl text-xs font-bold border transition-all flex items-center gap-2",
                      selectedCategories.includes(cat) 
                        ? "bg-white/10 border-cyan-400/50 text-cyan-400 shadow-[0_0_15px_rgba(34,211,238,0.1)]" 
                        : "bg-white/5 border-white/5 text-white/40 hover:border-white/20 hover:text-white"
                    )}
                  >
                    <div className={cn(
                      "w-2 h-2 rounded-full",
                      selectedCategories.includes(cat) ? "bg-cyan-400 animate-pulse" : "bg-white/20"
                    )} />
                    {cat}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* Hosts Grid */}
        <motion.div 
          layout
          className="grid md:grid-cols-2 lg:grid-cols-3 gap-8 relative z-10"
        >
          <AnimatePresence mode="popLayout">
            {sortedHosts.map((host) => (
              <motion.div
                key={host.id}
                layout
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                whileHover={{ y: -8 }}
                className={cn(
                  "backdrop-blur-xl bg-black/40 border-2 rounded-[2.5rem] p-8 flex flex-col gap-8 transition-all duration-500 group relative overflow-hidden",
                  host.borderColor,
                  host.glow
                )}
              >
                {/* Logo & Category */}
                <div className="flex justify-between items-start">
                  <div className={cn(
                    "w-16 h-16 rounded-[1.5rem] flex items-center justify-center text-2xl font-bold bg-gradient-to-br border border-white/10 shadow-inner",
                    host.color
                  )}>
                    {host.logo}
                  </div>
                  <span className="px-4 py-1.5 bg-white/5 border border-white/10 rounded-full text-[10px] font-mono uppercase tracking-widest text-white/40">
                    {host.category}
                  </span>
                </div>

                {/* Info */}
                <div className="space-y-2">
                  <h3 className="text-2xl font-display font-bold text-white group-hover:text-cyan-400 transition-colors">{host.name}</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="flex items-center gap-2 text-white/40">
                      <Cpu size={14} className="text-cyan-400/60" />
                      <span className="text-xs font-medium">{host.cpu}</span>
                    </div>
                    <div className="flex items-center gap-2 text-white/40">
                      <Activity size={14} className="text-cyan-400/60" />
                      <span className="text-xs font-medium">{host.ram} RAM</span>
                    </div>
                    <div className="flex items-center gap-2 text-white/40">
                      <Database size={14} className="text-cyan-400/60" />
                      <span className="text-xs font-medium">{host.storage}</span>
                    </div>
                    <div className="flex items-center gap-2 text-white/40">
                      <Zap size={14} className="text-cyan-400/60" />
                      <span className="text-xs font-medium">Auto-Deploy</span>
                    </div>
                  </div>
                </div>

                {/* Price & CTA */}
                <div className="mt-4 pt-6 border-t border-white/5 flex items-center justify-between">
                  <div className="flex flex-col">
                    <span className="text-[10px] font-mono text-white/20 uppercase tracking-tighter">À partir de</span>
                    <span className="text-2xl font-bold text-white">{host.price}€<span className="text-sm font-normal text-white/40">/mois</span></span>
                  </div>
                  <button className="px-6 py-3 bg-white/5 hover:bg-white text-white hover:text-black border border-white/10 rounded-2xl font-bold text-sm transition-all shadow-xl shadow-black/20 flex items-center gap-2 group-hover:px-7">
                    Voir l'offre <ChevronRight size={16} />
                  </button>
                </div>

                {/* Decorative background lueur */}
                <div className="absolute -bottom-20 -right-20 w-40 h-40 bg-white/5 blur-3xl rounded-full pointer-events-none group-hover:bg-white/10 transition-all duration-700" />
              </motion.div>
            ))}
          </AnimatePresence>
          
          {sortedHosts.length === 0 && (
            <div className="col-span-full py-20 text-center space-y-4">
              <Search className="mx-auto text-white/10" size={48} />
              <p className="text-white/40 font-medium">Aucun hébergeur ne correspond à vos filtres.</p>
              <button 
                onClick={() => { setSelectedCategories(['Gratuit (Free)']); setBudget(100); }}
                className="text-cyan-400 text-sm font-bold hover:underline"
              >
                Réinitialiser les filtres
              </button>
            </div>
          )}
        </motion.div>
      </div>
    );
  };

  const Documentation = () => (
    <div className="pt-32 pb-20 px-6 max-w-6xl mx-auto space-y-24 relative">
      {/* Decorative localized glows */}
      <div className="absolute top-40 -left-20 w-96 h-96 bg-cobalt-600/10 blur-[120px] rounded-full pointer-events-none" />
      <div className="absolute bottom-40 -right-20 w-96 h-96 bg-cyan-600/10 blur-[120px] rounded-full pointer-events-none" />

      <header className="text-center space-y-4">
        <motion.h1 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-6xl md:text-7xl font-display font-bold tracking-tighter"
        >
          Documentation
        </motion.h1>
        <motion.p 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2 }}
          className="text-white/40 text-lg max-w-2xl mx-auto"
        >
          Maîtrisez DiscordBot AI et créez des expériences uniques pour votre communauté.
        </motion.p>
      </header>

      {/* Section 1: Guide de démarrage */}
      <section className="space-y-10">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-cyan-500/10 flex items-center justify-center border border-cyan-500/20 shadow-[0_0_15px_rgba(6,182,212,0.1)]">
            <Zap className="text-cyan-400" size={28} />
          </div>
          <h2 className="text-3xl font-display font-bold text-cyan-400 uppercase tracking-widest">Guide de démarrage</h2>
        </div>

        <motion.div 
          initial={{ opacity: 0, y: 40 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="backdrop-blur-xl bg-white/5 border border-white/10 rounded-[2.5rem] p-10 md:p-12 shadow-2xl relative overflow-hidden group hover:border-white/20 transition-colors"
        >
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6 relative z-10">
            {[
              { num: "01", icon: <Sparkles />, title: "Décrivez", text: "Expliquez précisément les fonctionnalités souhaitées via notre interface intuitive." },
              { num: "02", icon: <Cpu />, title: "Générez", text: "Notre algorithme d'IA ultra-rapide conçoit l'architecture complète de votre bot." },
              { num: "03", icon: <Key />, title: "Le Token", text: "Obtenez vos clés sur le ", link: { text: "Discord Developer Portal", url: "https://discord.com/developers/applications" } },
              { num: "04", icon: <Rocket />, title: "Lancez", text: "Déployez votre bot en un clic et commencez à modérer votre serveur." }
            ].map((step, i) => (
              <div key={i} className="flex flex-col gap-6 p-6 rounded-3xl bg-white/[0.03] border border-white/5 hover:bg-white/[0.06] transition-all hover:-translate-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-mono text-cyan-400/50 bg-cyan-400/10 px-3 py-1 rounded-full uppercase tracking-tighter">{step.num}</span>
                  <div className="p-3 bg-white/5 rounded-2xl text-white/80">
                    {step.icon}
                  </div>
                </div>
                <div className="space-y-2">
                  <h3 className="text-xl font-bold text-white">{step.title}</h3>
                  <p className="text-sm text-white/50 leading-relaxed">
                    {step.text}
                    {step.link && (
                      <a href={step.link.url} target="_blank" className="text-indigo-400 hover:text-indigo-300 font-bold underline decoration-indigo-400/30 transition-colors"> {step.link.text}</a>
                    )}
                  </p>
                </div>
              </div>
            ))}
          </div>
          {/* Subtle background glow for the card */}
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[120%] h-[120%] bg-gradient-to-br from-indigo-500/5 via-transparent to-cyan-500/5 opacity-0 group-hover:opacity-100 transition-opacity duration-700" />
        </motion.div>
      </section>

      {/* Section 2: Exemples de commandes */}
      <section className="space-y-10">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-green-500/10 flex items-center justify-center border border-green-500/20 shadow-[0_0_15px_rgba(34,197,94,0.1)]">
            <Terminal className="text-green-400" size={28} />
          </div>
          <h2 className="text-3xl font-display font-bold text-green-400 uppercase tracking-widest">Exemples de commandes</h2>
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          {[
            { 
              title: "Modération", 
              cmd: "/ban @utilisateur raison:publicitaire", 
              desc: "Bannissement définitif avec journalisation automatique.",
              glow: "shadow-red-500/10 border-red-500/20 hover:border-red-500/40" 
            },
            { 
              title: "Économie", 
              cmd: "/portefeuille voir:@utilisateur", 
              desc: "Consultez le solde et l'inventaire des membres.",
              glow: "shadow-amber-500/10 border-amber-500/20 hover:border-amber-500/40" 
            },
            { 
              title: "Tickets", 
              cmd: "/ticket open priorite:haute", 
              desc: "Ouvre un canal de support privé crypté.",
              glow: "shadow-blue-500/10 border-blue-500/20 hover:border-blue-500/40" 
            },
            { 
              title: "Musique", 
              cmd: "/play search:'Lofi study beats'", 
              desc: "Streaming haute fidélité avec liste d'attente.",
              glow: "shadow-purple-500/10 border-purple-500/20 hover:border-purple-500/40" 
            }
          ].map((ex, i) => (
            <motion.div 
              key={i}
              initial={{ opacity: 0, scale: 0.95 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.1 }}
              className={cn(
                "backdrop-blur-lg bg-black/40 border rounded-[2rem] p-8 flex flex-col gap-6 shadow-2xl transition-all duration-500 group relative overflow-hidden",
                ex.glow
              )}
            >
              <div className="flex justify-between items-center relative z-10">
                <h3 className="text-lg font-bold text-white/90">{ex.title}</h3>
                <div className="flex gap-1.5">
                  <div className="w-2 h-2 rounded-full bg-red-400/40" />
                  <div className="w-2 h-2 rounded-full bg-amber-400/40" />
                  <div className="w-2 h-2 rounded-full bg-green-400/40" />
                </div>
              </div>
              <div className="bg-black/60 rounded-xl p-5 font-mono text-sm relative z-10 overflow-hidden border border-white/5">
                <span className="text-green-400 group-hover:text-green-300 transition-colors">$ </span>
                <span className="text-white/90">{ex.cmd}</span>
                <div className="absolute top-0 right-0 p-2 opacity-20">
                  <Terminal size={14} />
                </div>
              </div>
              <p className="text-sm text-white/40 leading-relaxed relative z-10">{ex.desc}</p>
              
              {/* Internal glow reflect */}
              <div className="absolute -top-20 -right-20 w-40 h-40 bg-white/5 blur-3xl rounded-full pointer-events-none group-hover:bg-white/10 transition-all duration-700" />
            </motion.div>
          ))}
        </div>
      </section>
    </div>
  );

  return (
    <div className="min-h-screen relative text-white font-sans selection:bg-indigo-500/30 bg-[#050505]">
      <TechBackground />
      <audio 
        ref={audioRef}
        src="https://cdn.pixabay.com/audio/2022/03/10/audio_c3622e0382.mp3" 
        loop
      />
      <Navbar />
      
      <main className="relative z-10">
        <AnimatePresence mode="wait">
          {view === 'landing' && <motion.div key="landing" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}><Landing /></motion.div>}
          {view === 'offres' && <motion.div key="offres" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}><Offres /></motion.div>}
          {view === 'select-pack' && <motion.div key="select-pack" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}><SelectPack /></motion.div>}
          {view === 'staff-login' && <motion.div key="staff-login" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}><StaffLogin /></motion.div>}
          {view === 'staff-dashboard' && <motion.div key="staff-dashboard" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}><StaffDashboard /></motion.div>}
          {view === 'dashboard' && <motion.div key="dashboard" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}><Dashboard /></motion.div>}
          {view === 'generator' && <motion.div key="generator" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}><Generator /></motion.div>}
          {view === 'editor' && <motion.div key="editor" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}><Editor /></motion.div>}
          {view === 'docs' && <motion.div key="docs" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}><Documentation /></motion.div>}
          {view === 'terms' && <motion.div key="terms" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}><TermsOfService /></motion.div>}
          {view === 'privacy' && <motion.div key="privacy" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}><PrivacyPolicy /></motion.div>}
          {view === 'host-selection' && <motion.div key="host-selection" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}><HostSelection /></motion.div>}
          {view === 'support' && <motion.div key="support" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}><SupportTickets /></motion.div>}
          {view === 'member-support' && <motion.div key="member-support" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}><MemberSupport /></motion.div>}
          {view === 'pack-management' && <motion.div key="pack-management" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}><PackManagement /></motion.div>}
          {view === 'transaction-tracking' && <motion.div key="transaction-tracking" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}><TransactionTracking /></motion.div>}
          {view === 'ticket-chat' && <motion.div key="ticket-chat" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}><TicketChat /></motion.div>}
          {view === 'login' && <motion.div key="login" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}><Auth mode="login" /></motion.div>}
          {view === 'signup' && <motion.div key="signup" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}><Auth mode="signup" /></motion.div>}
        </AnimatePresence>
      </main>

      <footer className="mt-32 backdrop-blur-3xl bg-black/40 border-t border-white/5 py-20 px-8 relative overflow-hidden">
        {/* Background glow reflects */}
        <div className="absolute top-0 left-1/4 w-[300px] h-[300px] bg-purple-600/5 blur-[100px] rounded-full pointer-events-none" />
        <div className="absolute bottom-0 right-1/4 w-[300px] h-[300px] bg-cyan-600/5 blur-[100px] rounded-full pointer-events-none" />

        <div className="max-w-7xl mx-auto space-y-16 relative z-10">
          <div className="flex flex-col md:flex-row items-center justify-between gap-12">
            <div className="flex items-center gap-4 group cursor-pointer" onClick={() => setView('landing')}>
               <div className="w-10 h-10 bg-indigo-600 rounded-lg flex items-center justify-center border border-white/10 shadow-[0_0_15px_rgba(79,70,229,0.3)]">
                  <BotIcon size={20} className="text-white" />
               </div>
               <span className="font-display font-bold text-2xl tracking-tighter italic">DiscordBot AI</span>
            </div>

            <div className="flex flex-wrap items-center justify-center gap-10 text-[13px] font-medium text-white/40">
              <button onClick={() => setView('staff-login')} className="hover:text-cyan-400 transition-colors">Staff</button>
              <button onClick={() => setView('terms')} className="hover:text-cyan-400 transition-colors">Conditions d'utilisation</button>
              <button onClick={() => setView('privacy')} className="hover:text-cyan-400 transition-colors">Confidentialité</button>
              <button className="hover:text-cyan-400 transition-colors">Contact</button>
            </div>

            <div className="flex items-center gap-4">
              <a href="https://github.com" target="_blank" className="w-12 h-12 rounded-2xl bg-white/[0.03] border border-white/5 flex items-center justify-center hover:bg-white/10 hover:border-white/20 transition-all hover:shadow-[0_0_20px_rgba(255,255,255,0.1)] group">
                <Github size={20} className="text-white/40 group-hover:text-white transition-colors" />
              </a>
              <a href="https://discord.gg/9YRwJTfVNX" target="_blank" className="w-12 h-12 rounded-2xl bg-[#5865F2]/5 border border-[#5865F2]/10 flex items-center justify-center hover:bg-[#5865F2]/20 hover:border-[#5865F2]/40 transition-all hover:shadow-[0_0_20px_rgba(88,101,242,0.3)] group">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" className="text-[#5865F2] group-hover:text-white transition-colors">
                  <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515a.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0a12.64 12.64 0 0 0-.617-1.25a.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057a19.9 19.9 0 0 0 5.993 3.03a.078.078 0 0 0 .084-.028a14.09 14.09 0 0 0 1.226-1.994a.076.076 0 0 0-.041-.106a13.107 13.107 0 0 1-1.872-.892a.077.077 0 0 1-.008-.128a10.2 10.2 0 0 0 .372-.292a.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127a12.299 12.299 0 0 1-1.873.892a.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028a19.839 19.839 0 0 0 6.002-3.03a.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419c0-1.333.955-2.419 2.157-2.419c1.21 0 2.176 1.086 2.157 2.419c0 1.334-.956 2.419-2.157 2.419zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419c0-1.333.955-2.419 2.157-2.419c1.21 0 2.176 1.086 2.157 2.419c0 1.334-.946 2.419-2.157 2.419z"/>
                </svg>
              </a>
            </div>
          </div>

          <div className="pt-12 border-t border-white/5 text-center space-y-2">
            <p className="text-[10px] text-white/20 uppercase tracking-[0.3em] font-black">© 2026 DiscordBot AI. Tous droits réservés.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
