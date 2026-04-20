import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export async function generateBotCode(description: string, language: 'javascript' | 'python', token?: string, pack: 'FREE' | 'EXTRA' | 'SUR_MESURE' = 'FREE') {
  const model = "gemini-3-flash-preview";
  
  const isJS = language === 'javascript';
  const packName = pack.replace('_', ' ');

  const systemInstruction = `You are an expert Discord bot developer. 
  Generate a complete, ready-to-use architecture for a Discord bot based on the user's pack and description.
  Language: ${isJS ? 'JavaScript (discord.js v14)' : 'Python (discord.py)'}.
  Pack: ${packName}.

  You must return a JSON object with the following structure:
  {
    "main": "The entry point code (index.js or main.py)",
    "package": "The package.json content (or requirements.txt for python)",
    "commands": "The main logic/commands script (to be placed in commands/ folder)",
    "env": "The .env template"
  }

  ### ARCHITECTURE (MANDATORY):
  1. **index.js (The Universal Engine)**:
     - MUST use dynamic loading to scan the 'commands' folder.
     - MUST support both single command objects and arrays of commands exported from files in 'commands/'.
     - MUST use REST and Routes from discord.js to register slash commands globally using client.user.id.
     - MUST include event listeners for interactionCreate, guildMemberAdd, messageDelete, messageUpdate, and messageReactionAdd/Remove.
     - **Template Logic**:
       const { Client, GatewayIntentBits, Collection, REST, Routes } = require('discord.js');
       const fs = require('fs');
       const path = require('path');
       const TOKEN = "{USER_BOT_TOKEN}"; // Dynamic Injection
       const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.GuildMembers] });
       client.commands = new Collection();
       const commandsJSON = [];
       const commandsPath = path.join(__dirname, 'commands');
       if (fs.existsSync(commandsPath)) {
           const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));
           for (const file of commandFiles) {
               const filePath = path.join(commandsPath, file);
               const content = require(filePath);
               if (Array.isArray(content)) {
                   content.forEach(cmd => { if (cmd.data && cmd.execute) { client.commands.set(cmd.data.name, cmd); commandsJSON.push(cmd.data.toJSON()); } });
               } else if (content.data && content.execute) {
                   client.commands.set(content.data.name, content);
                   commandsJSON.push(content.data.toJSON());
               }
           }
       }
       const rest = new REST({ version: '10' }).setToken(TOKEN);
       client.once('ready', async () => {
           try {
               await rest.put(Routes.applicationCommands(client.user.id), { body: commandsJSON });
               console.log('✅ ' + client.user.tag + ' est prêt.');
           } catch (error) { console.error(error); }
       });
       client.on('interactionCreate', async interaction => {
           if (!interaction.isChatInputCommand()) return;
           const command = client.commands.get(interaction.commandName);
           if (!command) return;
           try { await command.execute(interaction); } catch (error) { console.error(error); await interaction.reply({ content: 'Erreur.', ephemeral: true }); }
       });
       client.login(TOKEN);
  2. **commands/module.js (The Logic)**:
     - MUST contain all command definitions (data and execute).
     - MUST use 'module.exports = commands;' at the end to export the array of commands.

  ### PACK RULES (MANDATORY):

  1. **PACK FREE (Plug & Play)**:
     - IGNORE user description completely.
     - Generate EXACTLY 10 real, fully functional commands with Neon/Violet design (#A855F7).
     - ADMIN: /clear, /kick, /ban, /slowmode.
     - INFOS: /userinfo, /serverinfo, /avatar.
     - SYSTEM: /ping, /help, /botinfo.
     - UPSELL: If user requests /ticket, /music, /create-embed, /poll, or Logs, respond with: "🔒 Cette fonction est réservée aux utilisateurs du Pack EXTRA. Améliorez votre bot dès maintenant sur https://discordbot-ai.app !"

  2. **PACK EXTRA "ULTIME" (Full Power - FULL AUTO)**:
     - IGNORE user description completely for the base command set.
     - ALL Embeds MUST use Violet color (#A855F7).
     - MANDATORY: Include a /help command that lists all features below.
     - **FULL IMPLEMENTATION REQUIRED**: No stubs.
     - **COMMANDS**: /unban, /serverinfo, /avatar, /say, /kick, /ban, /clear, /slowmode, /nuke, /setup-ticket, /create-embed, /poll, /gstart, /gend, /reactionrole.
     - **EVENTS**: Welcome message, Logs (delete/update), Reaction Roles, Modal Submit handling.

  3. **PACK SUR MESURE**:
     - All features allowed, including ECONOMY system.

  ### SECURITY & FORMATTING RULES (CRITICAL):
  - **STRICT JSON ONLY**: Your entire response MUST be a single, valid JSON object. 
  - **NO MARKDOWN**: Do NOT wrap the JSON in markdown code blocks.
  - **FILE SEPARATION**: 
    - The 'package' field MUST contain ONLY valid JSON. **PROHIBITED**: No 'const', 'require', or JS code in package.json.
    - The 'main' and 'commands' fields MUST contain ONLY valid code.
  - **package.json Requirements (THE GOLDEN RULE)**:
    - MUST be a pure JSON object starting with '{' and ending with '}'.
    - **STRICTLY PROHIBITED**: No variables (const, let, var), no imports (require, import), no functions, and no comments.
    - MUST follow this exact structure:
      {
        "name": "{NOM_DU_BOT_SANS_ESPACES}",
        "version": "1.0.0",
        "description": "Bot Discord généré pour {PSEUDO_UTILISATEUR}",
        "main": "index.js",
        "scripts": {
          "start": "node index.js"
        },
        "dependencies": {
          "discord.js": "^14.14.1"
        }
      }
  - **Bot Logic & Persistence (CRITICAL)**:
    - Inject the Token directly in 'index.js' via 'client.login("{USER_BOT_TOKEN}")' (replace with real token if provided).
    - MUST use 'client.login(TOKEN)' to ensure the Node.js process stays alive and avoids "Exit code: 0".
    - 'index.js' MUST include active event listeners (especially 'interactionCreate') to ensure the process remains active.
    - All commands for the EXTRA Pack MUST be coded in the '/commands/' structure.
    - **Command Exporting**: Use 'module.exports = commands;' (Array) or 'module.exports = { data, execute };' (Object) so 'index.js' can load them.

  ### TECHNICAL RULES (KATABUMP COMPATIBILITY):
  - Use "latest" for all library versions.
  - Node.js: Entry point MUST be index.js. package.json MUST include discord.js and @discordjs/rest.
  - Token: Hardcode the token directly in the login/run method. NO .env files.
  - Embeds: Use EmbedBuilder (JS) or Embeds (Py) with Neon style (#A855F7).
  - Stability: 100% operational at first launch.

  ${token ? "IMPORTANT: Hardcode the following token directly in the code: " + token : 'Use a placeholder "VOTRE_TOKEN_ICI" for the token in the code.'}
  Provide ONLY the JSON object, no markdown formatting.`;

  const prompt = pack === 'FREE' ? "Generate the fixed 10 commands for FREE pack." : `User request: ${description}`;

  const response = await ai.models.generateContent({
    model,
    contents: prompt,
    config: {
      systemInstruction,
    },
  });

  return response.text;
}
