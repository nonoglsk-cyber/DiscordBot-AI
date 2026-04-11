import React, { useState, useEffect, useCallback } from 'react';
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
  ExternalLink
} from 'lucide-react';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { generateBotCode } from './services/geminiService';
import { User, Bot, View } from './types';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
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
  setDoc
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
  const [selectedPack, setSelectedPack] = useState<'FREE' | 'INITIAL' | 'EXTRA' | 'SUR_MESURE' | null>(null);
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

  const fetchOrders = useCallback(async () => {
    try {
      const q = query(collection(db, 'orders'), orderBy('date', 'desc'));
      const querySnapshot = await getDocs(q);
      const ordersData = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setPendingOrders(ordersData);
    } catch (e) {
      handleFirestoreError(e, OperationType.LIST, 'orders');
    }
  }, []);

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
    // Polling fallback for Discord Auth (if postMessage fails)
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

  const handleLogout = async () => {
    try {
      await signOut(auth);
      localStorage.removeItem('discord_session');
      setDiscordUser(null);
      setUser(null);
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
    
    // Ajout du script de commandes à la racine (Katabump compatibility)
    zip.file(cmdFileName, currentBot.code);

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
    <nav className="fixed top-0 left-0 right-0 z-50 px-6 py-4 flex items-center justify-between glass">
      <div className="flex items-center gap-2 cursor-pointer" onClick={() => setView('landing')}>
        <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center glow-primary">
          <BotIcon className="text-white" size={24} />
        </div>
        <span className="font-display font-bold text-xl tracking-tight">DiscordBot AI</span>
      </div>
      
      <div className="hidden md:flex items-center gap-8 text-sm font-medium text-white/60">
        <button onClick={() => setView('landing')} className={cn("hover:text-white transition-colors", view === 'landing' && "text-white")}>Accueil</button>
        <button onClick={() => setView('offres')} className={cn("hover:text-white transition-colors", view === 'offres' && "text-white")}>Nos Offres</button>
        <button onClick={() => setView('docs')} className={cn("hover:text-white transition-colors", view === 'docs' && "text-white")}>Documentation</button>
        {user && <button onClick={() => setView('dashboard')} className={cn("hover:text-white transition-colors", view === 'dashboard' && "text-white")}>Tableau de bord</button>}
      </div>

      <div className="flex items-center gap-4">
        {user ? (
          <div className="flex items-center gap-4">
            <span className="text-sm text-white/60 hidden sm:inline">{user.email}</span>
            <button onClick={handleLogout} className="p-2 hover:bg-white/10 rounded-lg transition-colors">
              <LogOut size={20} />
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <button onClick={() => setView('login')} className="px-4 py-2 text-sm font-medium hover:text-indigo-400 transition-colors">Connexion</button>
            <button onClick={() => setView('signup')} className="px-5 py-2 bg-indigo-600 rounded-lg text-sm font-bold glow-primary hover:bg-indigo-500 transition-all">S'inscrire</button>
          </div>
        )}
      </div>
    </nav>
  );

  const Landing = () => (
    <div className="pt-20">
      {/* Hero Section with Background Image */}
      <div className="relative min-h-[80vh] flex flex-col items-center justify-center px-6 overflow-hidden">
        {/* Background Image Layer */}
        <div className="absolute inset-0 z-0">
          <img 
            src="https://images.unsplash.com/photo-1639762681485-074b7f938ba0?q=80&w=2232&auto=format&fit=crop" 
            alt="Cyber Background" 
            className="w-full h-full object-cover opacity-30"
            referrerPolicy="no-referrer"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-[#050505] via-transparent to-[#050505]" />
          <div className="absolute inset-0 bg-[#050505]/40" />
        </div>

        <div className="relative z-10 max-w-7xl mx-auto w-full pt-20 pb-20">
          {/* Hero Content */}
          <div className="text-center">
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 text-xs font-bold uppercase tracking-widest mb-6"
            >
              <Sparkles size={14} />
              Propulsé par l'IA de pointe
            </motion.div>
            <motion.h1 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="text-5xl md:text-7xl font-display font-bold mb-6 leading-tight"
            >
              Créez votre Bot Discord <br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-emerald-400">sans coder.</span>
            </motion.h1>
            <motion.p 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="text-white/60 text-lg md:text-xl max-w-2xl mx-auto mb-10"
            >
              Décrivez vos besoins, notre IA génère le code complet, vous l'hébergez et le gérez en un clic. La création de bots n'a jamais été aussi simple.
            </motion.p>
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
              className="flex flex-col sm:flex-row items-center justify-center gap-4"
            >
              <button 
                onClick={() => user ? setView('generator') : setView('signup')}
                className="w-full sm:w-auto px-8 py-4 bg-indigo-600 rounded-xl font-bold text-lg glow-primary hover:bg-indigo-500 hover:scale-105 transition-all flex items-center justify-center gap-2"
              >
                Commencer gratuitement <ChevronRight size={20} />
              </button>
              <button onClick={() => setView('docs')} className="w-full sm:w-auto px-8 py-4 bg-white/5 border border-white/10 rounded-xl font-bold text-lg hover:bg-white/10 transition-all">
                Voir la documentation
              </button>
            </motion.div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-20">
        <div className="grid md:grid-cols-3 gap-8 mb-32">
          {[
            { icon: <Zap className="text-yellow-400" />, title: "Génération Instantanée", desc: "Obtenez un script complet en quelques secondes grâce à Gemini 3.1 Pro." },
            { icon: <Shield className="text-emerald-400" />, title: "Sécurisé & Propre", desc: "Le code généré suit les meilleures pratiques de sécurité et de performance." },
            { icon: <Cpu className="text-indigo-400" />, title: "Hébergement Intégré", desc: "Lancez votre bot directement depuis notre plateforme sans configuration complexe." }
          ].map((feature, i) => (
            <motion.div 
              key={i}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.1 }}
              className="p-8 rounded-2xl glass hover:border-white/20 transition-all group"
            >
              <div className="w-12 h-12 rounded-xl bg-white/5 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                {feature.icon}
              </div>
              <h3 className="text-xl font-bold mb-3">{feature.title}</h3>
              <p className="text-white/50 leading-relaxed">{feature.desc}</p>
            </motion.div>
          ))}
        </div>

      <div className="rounded-3xl overflow-hidden border border-white/10 bg-gradient-to-b from-white/5 to-transparent p-1">
        <div className="bg-[#0a0a0a] rounded-[22px] p-8 md:p-12 flex flex-col md:flex-row items-center gap-12">
          <div className="flex-1">
            <h2 className="text-3xl md:text-4xl font-display font-bold mb-6">Prêt à donner vie à votre serveur ?</h2>
            <p className="text-white/60 mb-8 text-lg">Rejoignez des milliers de créateurs qui utilisent DiscordBot AI pour automatiser leur communauté.</p>
            <ul className="space-y-4 mb-10">
              {["Modération automatique", "Système de tickets", "Musique haute qualité", "Économie & RPG"].map((item, i) => (
                <li key={i} className="flex items-center gap-3 text-white/80">
                  <div className="w-5 h-5 rounded-full bg-emerald-500/20 flex items-center justify-center">
                    <Check size={12} className="text-emerald-400" />
                  </div>
                  {item}
                </li>
              ))}
            </ul>
          </div>
          <div className="flex-1 w-full">
            <div className="glass rounded-2xl p-6 relative overflow-hidden group">
              <div className="absolute top-0 right-0 p-4">
                <div className="flex gap-1">
                  <div className="w-2 h-2 rounded-full bg-red-500/50" />
                  <div className="w-2 h-2 rounded-full bg-yellow-500/50" />
                  <div className="w-2 h-2 rounded-full bg-green-500/50" />
                </div>
              </div>
              <div className="font-mono text-sm text-indigo-400 mb-4">bot.js</div>
              <pre className="font-mono text-xs text-white/40 leading-relaxed">
                {`const { Client, GatewayIntentBits } = require('discord.js');
const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.on('ready', () => {
  console.log(\`Logged in as \${client.user.tag}!\`);
});

client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;
  if (interaction.commandName === 'ping') {
    await interaction.reply('Pong!');
  }
});

client.login(process.env.TOKEN);`}
              </pre>
              <div className="absolute inset-0 bg-gradient-to-t from-[#0a0a0a] via-transparent to-transparent opacity-60" />
            </div>
          </div>
        </div>
      </div>
    </div>
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

          <div className="grid lg:grid-cols-4 gap-6 items-stretch">
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
                  "5-10 Slash Commands basiques",
                  "/Ping & /Aide",
                  "Modération basique (/Ban, /Kick)",
                  "Pas d'accueil personnalisé",
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

            {/* PACK INITIAL */}
            <motion.div 
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              className="cyber-card p-8 rounded-3xl flex flex-col group"
              style={{ '--card-glow': 'rgba(59, 130, 246, 0.5)', '--card-glow-soft': 'rgba(59, 130, 246, 0.1)' } as any}
            >
              <div className="w-14 h-14 rounded-2xl bg-blue-500/10 flex items-center justify-center mb-6 group-hover:shadow-[0_0_15px_rgba(59,130,246,0.5)] transition-all">
                <Shield className="text-blue-400" size={28} />
              </div>
              <h3 className="text-2xl font-display font-bold mb-2">PACK INITIAL</h3>
              <p className="text-blue-400/80 text-sm font-medium mb-6">"La base solide pour votre communauté."</p>
              <ul className="space-y-4 mb-8 flex-1">
                {[
                  "Slash Commands (/)",
                  "Système de Modération complet",
                  "Utilitaires (Userinfo, Serverinfo)",
                  "Welcome personnalisé"
                ].map((item, i) => (
                  <li key={i} className="flex items-center gap-3 text-white/70 group-hover:text-white transition-colors">
                    <Check size={16} className="text-blue-400 group-hover:drop-shadow-[0_0_5px_rgba(59,130,246,0.8)]" />
                    <span className="text-sm">{item}</span>
                  </li>
                ))}
              </ul>
              <button className="w-full py-3 rounded-xl bg-blue-500/10 border border-blue-500/20 font-bold hover:bg-blue-500 hover:text-white transition-all">Choisir ce pack</button>
            </motion.div>

            {/* PACK EXTRA */}
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
              <p className="text-purple-400/80 text-sm font-medium mb-6">"Automatisation totale et gestion dynamique."</p>
              <ul className="space-y-4 mb-8 flex-1">
                {[
                  "Tout le Pack Initial",
                  "Système de Tickets",
                  "Logs Avancés",
                  "Auto-Rôles / Reaction-Roles",
                  "Système de Giveaways"
                ].map((item, i) => (
                  <li key={i} className="flex items-center gap-3 text-white/70 group-hover:text-white transition-colors">
                    <Check size={16} className="text-purple-400 group-hover:drop-shadow-[0_0_5px_rgba(168,85,247,0.8)]" />
                    <span className="text-sm">{item}</span>
                  </li>
                ))}
              </ul>
              <button className="w-full py-3 rounded-xl bg-purple-600 font-bold shadow-[0_0_20px_rgba(168,85,247,0.4)] hover:bg-purple-500 hover:scale-105 transition-all">Choisir ce pack</button>
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
              <button className="w-full py-3 rounded-xl bg-yellow-500/10 border border-yellow-500/20 font-bold hover:bg-yellow-500 hover:text-white transition-all">Choisir ce pack</button>
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
      <div className="grid lg:grid-cols-4 gap-6 items-stretch">
        {/* Reuse the same cards but with redirect */}
        {[
          { 
            name: "PACK FREE", 
            tagline: "Pour tester nos services.", 
            color: "slate", 
            icon: <BotIcon size={28} />,
            features: [
              "Hébergement : Non fourni", 
              "5-10 Slash Commands basiques", 
              "/Ping & /Aide", 
              "Modération basique (/Ban, /Kick)", 
              "Pas d'accueil personnalisé",
              "1 seul bot tous les 2 jours"
            ]
          },
          { 
            name: "PACK INITIAL", 
            tagline: "La base solide pour votre communauté.", 
            color: "blue", 
            icon: <Shield size={28} />,
            features: ["Slash Commands (/)", "Système de Modération complet", "Utilitaires (Userinfo, Serverinfo)", "Welcome personnalisé"]
          },
          { 
            name: "PACK EXTRA", 
            tagline: "Automatisation totale et gestion dynamique.", 
            color: "purple", 
            icon: <Zap size={28} />,
            recommended: true,
            features: ["Tout le Pack Initial", "Système de Tickets", "Logs Avancés", "Auto-Rôles / Reaction-Roles", "Système de Giveaways"]
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
        fetchOrders();
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
    <div className="pt-32 pb-20 px-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-12">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-3">
            <Shield className="text-indigo-400" /> Dashboard Staff
          </h1>
          <p className="text-white/40 mt-1">Gestion des validations de packs et paiements.</p>
        </div>
        <button onClick={() => setView('landing')} className="px-4 py-2 bg-white/5 hover:bg-white/10 rounded-lg text-sm font-bold transition-colors">
          Quitter
        </button>
      </div>

      <div className="grid gap-6">
        <div className="glass rounded-3xl overflow-hidden border-white/5">
          <div className="px-8 py-4 bg-white/5 border-b border-white/5 flex items-center justify-between">
            <h3 className="font-bold text-sm uppercase tracking-widest text-white/60">Commandes en attente</h3>
            <span className="px-2 py-1 bg-indigo-500/20 text-indigo-400 rounded text-[10px] font-bold">{pendingOrders.length} NOUVELLES</span>
          </div>
          <div className="divide-y divide-white/5">
            {pendingOrders.map((order) => (
              <div key={order.id} className="p-8 flex flex-col md:flex-row md:items-center justify-between gap-6 hover:bg-white/[0.02] transition-colors">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-xl bg-indigo-500/10 flex items-center justify-center">
                    <BotIcon className="text-indigo-400" size={24} />
                  </div>
                  <div>
                    <div className="font-bold">{order.user}</div>
                    <div className="text-xs text-white/40">Demande de {order.pack} • {order.date}</div>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="px-3 py-1 bg-yellow-500/10 text-yellow-400 rounded-full text-[10px] font-bold uppercase tracking-wider">
                    {order.status}
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
                    className="px-6 py-2 bg-emerald-600 rounded-xl text-xs font-bold hover:bg-emerald-500 transition-all shadow-[0_0_15px_rgba(16,185,129,0.3)]"
                  >
                    Valider le Pack
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );

  const Dashboard = () => (
    <div className="pt-32 pb-20 px-6 max-w-7xl mx-auto">
      {/* Personalized Welcome */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-12">
        <motion.div 
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
        >
          <h1 className="text-3xl font-display font-bold mb-2">
            Ravi de vous revoir, <span className="text-indigo-400">{user?.email?.split('@')[0]}</span> ! 👋
          </h1>
          <p className="text-white/50">Votre centre de contrôle est opérationnel. Prêt à forger ?</p>
        </motion.div>
        
        {/* Gamification: Level Bar */}
        <motion.div 
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          className="glass p-4 rounded-2xl border-indigo-500/20 min-w-[240px]"
        >
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Award className="text-yellow-400" size={18} />
              <span className="text-xs font-bold uppercase tracking-wider">Niveau 4 : Forgeron d'Élite</span>
            </div>
            <span className="text-[10px] font-bold text-white/40">750 / 1000 XP</span>
          </div>
          <div className="h-2 bg-white/5 rounded-full overflow-hidden">
            <motion.div 
              initial={{ width: 0 }}
              animate={{ width: '75%' }}
              className="h-full bg-gradient-to-r from-indigo-500 to-purple-500"
            />
          </div>
        </motion.div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-12">
        {[
          { label: "Bots Totaux", value: bots.length, icon: <BotIcon size={20} />, color: "text-indigo-400" },
          { label: "En Ligne", value: bots.filter(b => b.status === 'online').length, icon: <Activity size={20} />, color: "text-emerald-400" },
          { label: "Commandes", value: bots.length * 12 + 5, icon: <Terminal size={20} />, color: "text-purple-400" },
          { label: "Badges", value: 3, icon: <Star size={20} />, color: "text-yellow-400" }
        ].map((stat, i) => (
          <motion.div 
            key={i}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05 }}
            className="glass p-6 rounded-2xl border-white/5 hover:border-white/10 transition-all"
          >
            <div className={cn("w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center mb-4", stat.color)}>
              {stat.icon}
            </div>
            <div className="text-2xl font-bold mb-1">{stat.value}</div>
            <div className="text-xs font-bold text-white/30 uppercase tracking-widest">{stat.label}</div>
          </motion.div>
        ))}
      </div>

      <div className="grid lg:grid-cols-3 gap-8">
        {/* Main Bots List */}
        <div className="lg:col-span-2">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-bold flex items-center gap-2">
              <Layout size={20} className="text-indigo-400" /> Vos Créations
            </h2>
            <button 
              onClick={handleNewBot}
              className="px-4 py-2 bg-indigo-600 rounded-lg text-sm font-bold glow-primary hover:bg-indigo-500 transition-all flex items-center gap-2"
            >
              <Plus size={18} /> Nouveau
            </button>
          </div>

          {bots.length === 0 ? (
            <div className="text-center py-20 glass rounded-3xl border-dashed border-white/10">
              <div className="w-16 h-16 bg-white/5 rounded-2xl flex items-center justify-center mx-auto mb-6">
                <BotIcon className="text-white/20" size={32} />
              </div>
              <h3 className="text-xl font-bold mb-2">Aucun bot trouvé</h3>
              <p className="text-white/40 mb-8">Commencez par créer votre premier bot avec l'IA.</p>
              <button onClick={handleNewBot} className="text-indigo-400 font-bold hover:underline">Lancer le générateur</button>
            </div>
          ) : (
            <div className="grid md:grid-cols-2 gap-4">
              {bots.map((bot) => (
                <motion.div 
                  key={bot.id}
                  layoutId={`bot-${bot.id}`}
                  className="glass rounded-2xl p-5 hover:border-white/20 transition-all group"
                >
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <div className={cn(
                        "w-10 h-10 rounded-xl flex items-center justify-center",
                        bot.language === 'javascript' ? "bg-yellow-500/10 text-yellow-500" : "bg-blue-500/10 text-blue-500"
                      )}>
                        {bot.language === 'javascript' ? <Code size={20} /> : <Terminal size={20} />}
                      </div>
                      <div>
                        <h3 className="font-bold truncate max-w-[120px]">{bot.name}</h3>
                        <span className="text-[10px] uppercase tracking-wider font-bold opacity-40">{bot.language}</span>
                      </div>
                    </div>
                    <div className={cn(
                      "px-2 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider flex items-center gap-1.5",
                      bot.status === 'online' ? "bg-emerald-500/10 text-emerald-400" : "bg-white/5 text-white/40"
                    )}>
                      <div className={cn("w-1.5 h-1.5 rounded-full", bot.status === 'online' ? "bg-emerald-400 animate-pulse" : "bg-white/20")} />
                      {bot.status}
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-2">
                    <button 
                      onClick={() => { setCurrentBot(bot); setView('editor'); }}
                      className="flex-1 py-2 bg-white/5 hover:bg-white/10 rounded-lg text-xs font-bold transition-colors"
                    >
                      Gérer
                    </button>
                    <button 
                      onClick={() => toggleBotStatus(bot)}
                      className={cn(
                        "p-2 rounded-lg transition-colors",
                        bot.status === 'online' ? "bg-red-500/10 text-red-400 hover:bg-red-500/20" : "bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20"
                      )}
                    >
                      {bot.status === 'online' ? <Square size={16} /> : <Play size={16} />}
                    </button>
                    <button 
                      onClick={() => deleteBot(bot.id as string)}
                      className="p-2 rounded-lg bg-white/5 hover:bg-red-500/20 text-white/40 hover:text-red-400 transition-all"
                      title="Supprimer"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </motion.div>
              ))}
            </div>
          )}
        </div>

        {/* Sidebar: Suggestions & Notifications */}
        <div className="space-y-6">
          <div className="glass rounded-3xl p-6 border-indigo-500/10">
            <h3 className="font-bold mb-6 flex items-center gap-2">
              <Lightbulb size={18} className="text-yellow-400" /> Suggestions IA
            </h3>
            <div className="space-y-4">
              {[
                { title: "Bot de Sondages", desc: "Créez un bot pour engager votre communauté avec des votes interactifs.", icon: <TrendingUp size={14} /> },
                { title: "Système de Niveaux", desc: "Récompensez vos membres les plus actifs avec de l'XP et des rôles.", icon: <Award size={14} /> },
                { title: "Logs de Sécurité", desc: "Gardez un œil sur tout ce qui se passe sur votre serveur.", icon: <Shield size={14} /> }
              ].map((sug, i) => (
                <button 
                  key={i}
                  onClick={() => { setPrompt(sug.title + ": " + sug.desc); setView('generator'); }}
                  className="w-full text-left p-4 rounded-xl bg-white/5 hover:bg-white/10 border border-white/5 transition-all group"
                >
                  <div className="flex items-center gap-2 text-indigo-400 mb-1 font-bold text-sm">
                    {sug.icon} {sug.title}
                  </div>
                  <p className="text-xs text-white/40 leading-relaxed group-hover:text-white/60 transition-colors">{sug.desc}</p>
                </button>
              ))}
            </div>
          </div>

          <div className="glass rounded-3xl p-6 border-emerald-500/10">
            <h3 className="font-bold mb-4 flex items-center gap-2">
              <MessageSquare size={18} className="text-emerald-400" /> Notifications
            </h3>
            <div className="space-y-3">
              <div className="p-3 rounded-xl bg-emerald-500/5 border border-emerald-500/10 text-[11px] text-emerald-400/80">
                ✨ Votre bot "Modérateur Pro" a été mis à jour avec succès.
              </div>
              <div className="p-3 rounded-xl bg-indigo-500/5 border border-indigo-500/10 text-[11px] text-indigo-400/80">
                🏆 Nouveau badge débloqué : "Premier Script" !
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  const Generator = () => (
    <div className="pt-32 pb-20 px-6 max-w-4xl mx-auto">
      <div className="text-center mb-12">
        <h1 className="text-4xl font-display font-bold mb-4">Générateur de Bot</h1>
        <p className="text-white/50">Décrivez les fonctionnalités que vous souhaitez pour votre bot.</p>
      </div>

      <div className="glass rounded-3xl p-8 md:p-10">
        {genError && (
          <div className="mb-6 p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm flex items-center gap-3">
            <Shield size={18} />
            {genError}
          </div>
        )}
        <div className="mb-8">
          <label className="block text-sm font-bold text-white/60 uppercase tracking-wider mb-3">Langage de programmation</label>
          <div className="grid grid-cols-2 gap-4">
            <button 
              onClick={() => setLanguage('javascript')}
              className={cn(
                "p-4 rounded-xl border flex items-center justify-center gap-3 transition-all",
                language === 'javascript' ? "bg-indigo-600/10 border-indigo-500 text-indigo-400" : "bg-white/5 border-white/10 text-white/40 hover:border-white/20"
              )}
            >
              <Code size={20} /> JavaScript (discord.js)
            </button>
            <button 
              onClick={() => setLanguage('python')}
              className={cn(
                "p-4 rounded-xl border flex items-center justify-center gap-3 transition-all",
                language === 'python' ? "bg-indigo-600/10 border-indigo-500 text-indigo-400" : "bg-white/5 border-white/10 text-white/40 hover:border-white/20"
              )}
            >
              <Terminal size={20} /> Python (discord.py)
            </button>
          </div>
        </div>

        <div className="mb-8">
          <label className="block text-sm font-bold text-white/60 uppercase tracking-wider mb-3">Token du Bot Discord</label>
          <div className="relative">
            <input 
              type="password"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="MTAyNjg4OT..."
              className="w-full bg-white/5 border border-white/10 rounded-xl px-6 py-4 text-white placeholder:text-white/20 focus:outline-none focus:border-indigo-500 transition-all"
            />
            <div className="absolute right-4 top-1/2 -translate-y-1/2 text-[10px] font-bold text-white/20 uppercase tracking-widest pointer-events-none">
              Confidentiel
            </div>
          </div>
          <p className="mt-2 text-[10px] text-white/30 italic">Votre token est nécessaire pour connecter le bot à Discord. Il ne sera jamais partagé.</p>
        </div>

        <div className="mb-10">
          <label className="block text-sm font-bold text-white/60 uppercase tracking-wider mb-3">
            Description du bot {selectedPack === 'FREE' && <span className="text-indigo-400 normal-case font-normal ml-2">(Automatique pour le Pack FREE)</span>}
          </label>
          <textarea 
            value={selectedPack === 'FREE' ? "Pack FREE : Configuration automatique (10 commandes incluses). La description est ignorée." : prompt}
            onChange={(e) => setPrompt(e.target.value)}
            disabled={selectedPack === 'FREE'}
            placeholder="Ex: Un bot de modération avec des commandes /ban, /kick, un système de logs et un filtre anti-spam..."
            className={cn(
              "w-full h-48 bg-white/5 border border-white/10 rounded-2xl p-6 text-white placeholder:text-white/20 focus:outline-none focus:border-indigo-500 transition-all resize-none",
              selectedPack === 'FREE' && "opacity-50 cursor-not-allowed italic text-white/40"
            )}
          />
          {selectedPack !== 'FREE' && (
            <div className="mt-4 flex flex-wrap gap-2">
              {["Modération", "Tickets", "Musique", "Économie", "RPG", "Logs"].map((tag) => (
                <button 
                  key={tag}
                  onClick={() => setPrompt(prev => prev + (prev ? ", " : "") + tag)}
                  className="px-3 py-1 rounded-full bg-white/5 border border-white/10 text-xs text-white/40 hover:bg-white/10 hover:text-white transition-all"
                >
                  + {tag}
                </button>
              ))}
            </div>
          )}
        </div>

        <button 
          onClick={handleGenerate}
          disabled={loading || (selectedPack !== 'FREE' && !prompt)}
          className="w-full py-5 bg-indigo-600 rounded-2xl font-bold text-xl glow-primary hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-3"
        >
          {loading ? (
            <>
              <div className="w-6 h-6 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              Génération en cours...
            </>
          ) : (
            <>
              <Sparkles size={24} /> Générer le bot
            </>
          )}
        </button>
      </div>
    </div>
  );

  const Editor = () => (
    <div className="pt-24 h-screen flex flex-col">
      <div className="px-6 py-4 glass flex items-center justify-between z-20">
        <div className="flex items-center gap-4">
          <button onClick={() => setView('dashboard')} className="p-2 hover:bg-white/10 rounded-lg transition-colors">
            <ChevronRight size={20} className="rotate-180" />
          </button>
          <div>
            <h2 className="font-bold">{currentBot?.name}</h2>
            <div className="flex items-center gap-2">
              <span className="text-[10px] uppercase tracking-wider font-bold opacity-40">{currentBot?.language}</span>
              <div className={cn(
                "w-1.5 h-1.5 rounded-full", 
                currentBot?.status === 'online' ? "bg-emerald-400 animate-pulse" : "bg-white/20"
              )} />
              <span className="text-[10px] uppercase tracking-wider font-bold opacity-40">
                {isBooting ? "Démarrage..." : currentBot?.status}
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button onClick={copyToClipboard} className="p-2 bg-white/5 hover:bg-white/10 rounded-lg transition-colors relative group">
            {copied ? <Check size={18} className="text-emerald-400" /> : <Copy size={18} />}
            <span className="absolute -bottom-10 left-1/2 -translate-x-1/2 px-2 py-1 bg-black text-[10px] rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">Copier le code</span>
          </button>
          <button onClick={downloadCode} className="p-2 bg-white/5 hover:bg-white/10 rounded-lg transition-colors relative group">
            <Download size={18} />
            <span className="absolute -bottom-10 left-1/2 -translate-x-1/2 px-2 py-1 bg-black text-[10px] rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">Télécharger le fichier</span>
          </button>
          <button onClick={downloadZip} className="p-2 bg-indigo-500/10 text-indigo-400 hover:bg-indigo-500/20 rounded-lg transition-colors relative group">
            <Ticket size={18} />
            <span className="absolute -bottom-10 left-1/2 -translate-x-1/2 px-2 py-1 bg-black text-[10px] rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">Télécharger ZIP (Pack Complet)</span>
          </button>
          <div className="w-px h-6 bg-white/10 mx-2" />
          <button 
            onClick={() => currentBot && toggleBotStatus(currentBot)}
            disabled={isBooting}
            className={cn(
              "px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2 transition-all disabled:opacity-50",
              currentBot?.status === 'online' ? "bg-red-500/10 text-red-400 hover:bg-red-500/20" : "bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20"
            )}
          >
            {isBooting ? (
              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : currentBot?.status === 'online' ? (
              <><Square size={16} /> Arrêter</>
            ) : (
              <><Play size={16} /> Lancer</>
            )}
          </button>
          <button onClick={saveBotCode} className="px-4 py-2 bg-indigo-600 rounded-lg text-sm font-bold glow-primary hover:bg-indigo-500 transition-all flex items-center gap-2">
            <Save size={16} /> Sauvegarder
          </button>
        </div>
      </div>

      {/* Futuristic Progress Bar */}
      <AnimatePresence>
        {isZipping && (
          <motion.div 
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="bg-indigo-600/10 border-b border-indigo-500/20 overflow-hidden"
          >
            <div className="px-6 py-3 flex items-center justify-between gap-4">
              <div className="flex items-center gap-3 flex-1">
                <div className="w-4 h-4 border-2 border-indigo-500/30 border-t-indigo-400 rounded-full animate-spin shrink-0" />
                <span className="text-[10px] font-bold uppercase tracking-widest text-indigo-400 animate-pulse">{zipStatus}</span>
              </div>
              <div className="w-64 h-1.5 bg-white/5 rounded-full overflow-hidden">
                <motion.div 
                  initial={{ width: 0 }}
                  animate={{ width: `${zipProgress}%` }}
                  className="h-full bg-indigo-500 shadow-[0_0_10px_rgba(99,102,241,0.5)]"
                />
              </div>
              <span className="text-[10px] font-mono text-indigo-400/60">{zipProgress}%</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex-1 overflow-hidden flex flex-col lg:flex-row">
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* File Tabs */}
          <div className="flex bg-white/5 border-b border-white/10">
            {[
              { id: 'commands', label: currentBot?.language === 'javascript' ? 'commands.js' : 'commands.py', icon: <Code size={14} /> },
              { id: 'main', label: currentBot?.language === 'javascript' ? 'main.js' : 'main.py', icon: <Play size={14} /> },
              { id: 'package', label: currentBot?.language === 'javascript' ? 'package.json' : 'requirements.txt', icon: <Settings size={14} /> },
              { id: 'env', label: '.env', icon: <Shield size={14} /> },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveFile(tab.id as any)}
                className={cn(
                  "px-4 py-2 text-[10px] font-bold uppercase tracking-widest flex items-center gap-2 border-r border-white/10 transition-all",
                  activeFile === tab.id ? "bg-indigo-600/20 text-indigo-400 border-b-2 border-b-indigo-500" : "text-white/40 hover:bg-white/5"
                )}
              >
                {tab.icon} {tab.label}
              </button>
            ))}
          </div>

          <div className="flex-1 overflow-auto code-editor">
            <SyntaxHighlighter 
              language={
                activeFile === 'package' ? (currentBot?.language === 'javascript' ? 'json' : 'text') :
                activeFile === 'env' ? 'bash' :
                (currentBot?.language === 'javascript' ? 'javascript' : 'python')
              } 
              style={vscDarkPlus}
              customStyle={{ margin: 0, padding: '2rem', background: 'transparent', fontSize: '14px', lineHeight: '1.6' }}
              showLineNumbers
            >
              {activeFile === 'commands' ? currentBot?.code || '' :
               activeFile === 'main' ? currentBot?.architecture?.main || '' :
               activeFile === 'package' ? currentBot?.architecture?.package || '' :
               currentBot?.architecture?.env || ''}
            </SyntaxHighlighter>
          </div>
          
          {/* Terminal / Console */}
          <div className="h-48 bg-black/40 border-t border-white/10 flex flex-col">
            <div className="px-4 py-2 bg-white/5 border-b border-white/5 flex items-center justify-between">
              <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-white/40">
                <Terminal size={12} /> Console de sortie
              </div>
              <button onClick={() => setBotLogs([])} className="text-[10px] text-white/20 hover:text-white transition-colors">Effacer</button>
            </div>
            <div className="flex-1 overflow-auto p-4 font-mono text-xs space-y-1">
              {botLogs.length === 0 ? (
                <div className="text-white/10 italic">En attente du lancement du bot...</div>
              ) : (
                botLogs.map((log, i) => (
                  <div key={i} className={cn(
                    log.includes('[ERROR]') ? "text-red-400" : 
                    log.includes('[SUCCESS]') || log.includes('[READY]') ? "text-emerald-400" : 
                    log.includes('[INFO]') ? "text-blue-400" : 
                    log.includes('[STEP]') ? "text-indigo-400 font-bold" : "text-white/60"
                  )}>
                    <span className="text-white/20 mr-2">[{new Date().toLocaleTimeString()}]</span>
                    {log}
                  </div>
                ))
              )}
              {isBooting && (
                <div className="text-white/40 animate-pulse flex items-center gap-2">
                  <div className="w-1 h-3 bg-white/40 animate-blink" /> Chargement...
                </div>
              )}
            </div>
          </div>
        </div>
        
        <div className="w-80 glass border-l border-white/10 p-6 hidden lg:block overflow-auto">
          <div className="mb-8">
            <h3 className="font-bold mb-4 flex items-center gap-2 text-indigo-400"><Shield size={18} /> Configuration</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-[10px] font-bold text-white/40 uppercase tracking-widest mb-2">Token du Bot</label>
                <div className="relative">
                  <input 
                    type="password"
                    value={currentBot?.token || ''}
                    onChange={(e) => {
                      if (currentBot) {
                        const updatedBot = { ...currentBot, token: e.target.value };
                        setCurrentBot(updatedBot);
                        // Also update in the list
                        setBots(prev => prev.map(b => b.id === currentBot.id ? updatedBot : b));
                      }
                    }}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2 text-xs focus:outline-none focus:border-indigo-500 transition-all"
                    placeholder="Mettre à jour le token..."
                  />
                </div>
              </div>
            </div>
          </div>

          <h3 className="font-bold mb-6 flex items-center gap-2"><Book size={18} /> Aide & Astuces</h3>
          <div className="space-y-6">
            <div className="p-4 rounded-xl bg-yellow-500/10 border border-yellow-500/20">
              <p className="text-[11px] text-yellow-200/80 leading-relaxed flex gap-2">
                <AlertTriangle size={14} className="shrink-0 mt-0.5" />
                <span>
                  <span className="font-bold text-yellow-400">Note :</span> Après le premier lancement, il peut y avoir un délai de quelques minutes avant que Discord n'affiche vos nouvelles commandes. Redémarrez votre application Discord pour forcer la mise à jour.
                </span>
              </p>
            </div>
            <div>
              <h4 className="text-xs font-bold text-white/40 uppercase tracking-widest mb-3">Prochaines étapes</h4>
              <ul className="space-y-3 text-sm text-white/70">
                <li className="flex gap-2"><div className="w-1.5 h-1.5 rounded-full bg-indigo-500 mt-1.5 shrink-0" /> Récupérez votre Token sur le Discord Developer Portal.</li>
                <li className="flex gap-2"><div className="w-1.5 h-1.5 rounded-full bg-indigo-500 mt-1.5 shrink-0" /> Remplacez 'YOUR_TOKEN' par votre token.</li>
                <li className="flex gap-2"><div className="w-1.5 h-1.5 rounded-full bg-indigo-500 mt-1.5 shrink-0" /> Cliquez sur "Lancer" pour héberger le bot.</li>
              </ul>
            </div>
            <div className="p-4 rounded-xl bg-indigo-500/10 border border-indigo-500/20">
              <p className="text-[11px] text-indigo-200/80 leading-relaxed flex gap-2">
                <Lightbulb size={14} className="shrink-0 mt-0.5" />
                <span>
                  <span className="font-bold text-indigo-400">Astuce :</span> Si vous voyez l'erreur <code className="bg-white/10 px-1 rounded">Module not found</code>, tapez <code className="bg-white/10 px-1 rounded text-white">npm install</code> dans la console de votre hébergeur.
                </span>
              </p>
            </div>
            <div className="p-4 rounded-xl bg-indigo-500/10 border border-indigo-500/20">
              <p className="text-xs text-indigo-300 leading-relaxed">
                Besoin d'une nouvelle commande ? Utilisez le générateur pour ajouter des fonctionnalités à votre script existant.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

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

  const Documentation = () => (
    <div className="pt-32 pb-20 px-6 max-w-4xl mx-auto">
      <h1 className="text-4xl font-display font-bold mb-8">Documentation</h1>
      <div className="space-y-12">
        <section>
          <h2 className="text-2xl font-bold mb-4 flex items-center gap-2 text-indigo-400"><Zap size={24} /> Guide de démarrage</h2>
          <div className="glass rounded-2xl p-8 space-y-4 text-white/70 leading-relaxed">
            <p>Bienvenue sur DiscordBot AI ! Voici comment créer votre premier bot en moins de 2 minutes :</p>
            <ol className="list-decimal list-inside space-y-4 ml-4">
              <li><span className="text-white font-bold">Décrivez votre bot :</span> Utilisez le générateur pour expliquer ce que vous voulez. Soyez précis pour de meilleurs résultats.</li>
              <li><span className="text-white font-bold">Générez le code :</span> Notre IA s'occupe de tout le reste.</li>
              <li><span className="text-white font-bold">Configurez le Token :</span> Allez sur le <a href="https://discord.com/developers/applications" target="_blank" className="text-indigo-400 underline">Discord Developer Portal</a>, créez une application, et récupérez votre Token.</li>
              <li><span className="text-white font-bold">Lancez l'hébergement :</span> Collez votre token dans le code et cliquez sur "Lancer".</li>
            </ol>
          </div>
        </section>

        <section>
          <h2 className="text-2xl font-bold mb-4 flex items-center gap-2 text-emerald-400"><MessageSquare size={24} /> Exemples de commandes</h2>
          <div className="grid md:grid-cols-2 gap-4">
            {[
              { title: "Modération", cmd: "/ban @user reason", desc: "Bannit un utilisateur du serveur." },
              { title: "Économie", cmd: "/balance", desc: "Affiche le solde de l'utilisateur." },
              { title: "Tickets", cmd: "/ticket open", desc: "Ouvre un nouveau ticket de support." },
              { title: "Musique", cmd: "/play song_name", desc: "Joue une musique dans le salon vocal." }
            ].map((ex, i) => (
              <div key={i} className="glass rounded-xl p-6">
                <h3 className="font-bold mb-2">{ex.title}</h3>
                <code className="block bg-white/5 p-2 rounded text-indigo-300 text-sm mb-2">{ex.cmd}</code>
                <p className="text-xs text-white/40">{ex.desc}</p>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#050505]">
      <Navbar />
      
      <main>
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
          {view === 'login' && <motion.div key="login" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}><Auth mode="login" /></motion.div>}
          {view === 'signup' && <motion.div key="signup" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}><Auth mode="signup" /></motion.div>}
        </AnimatePresence>
      </main>

      <footer className="py-12 border-t border-white/5 px-6">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-8">
          <div className="flex items-center gap-2 opacity-50">
            <BotIcon size={20} />
            <span className="font-display font-bold">DiscordBot AI</span>
          </div>
          <div className="flex items-center gap-6 text-sm text-white/40">
            <button onClick={() => setView('staff-login')} className="hover:text-white transition-colors">Staff</button>
            <a href="#" className="hover:text-white transition-colors">Conditions d'utilisation</a>
            <a href="#" className="hover:text-white transition-colors">Confidentialité</a>
            <a href="#" className="hover:text-white transition-colors">Contact</a>
          </div>
          <div className="flex items-center gap-4">
            <a href="https://github.com" target="_blank" className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center hover:bg-white/10 transition-colors"><Github size={20} /></a>
            <a href="https://discord.gg/9YRwJTfVNX" target="_blank" className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center hover:bg-white/10 transition-colors">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" className="text-[#5865F2]">
                <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515a.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0a12.64 12.64 0 0 0-.617-1.25a.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057a19.9 19.9 0 0 0 5.993 3.03a.078.078 0 0 0 .084-.028a14.09 14.09 0 0 0 1.226-1.994a.076.076 0 0 0-.041-.106a13.107 13.107 0 0 1-1.872-.892a.077.077 0 0 1-.008-.128a10.2 10.2 0 0 0 .372-.292a.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127a12.299 12.299 0 0 1-1.873.892a.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028a19.839 19.839 0 0 0 6.002-3.03a.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419c0-1.333.955-2.419 2.157-2.419c1.21 0 2.176 1.086 2.157 2.419c0 1.334-.956 2.419-2.157 2.419zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419c0-1.333.955-2.419 2.157-2.419c1.21 0 2.176 1.086 2.157 2.419c0 1.334-.946 2.419-2.157 2.419z"/>
              </svg>
            </a>
          </div>
        </div>
        <div className="text-center mt-8 text-xs text-white/20">
          © 2024 DiscordBot AI. Tous droits réservés.
        </div>
      </footer>
    </div>
  );
}
