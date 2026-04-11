import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export async function generateBotCode(description: string, language: 'javascript' | 'python', token?: string, pack: 'FREE' | 'INITIAL' | 'EXTRA' | 'SUR_MESURE' = 'FREE') {
  const model = "gemini-3.1-pro-preview";
  
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

  ### PACK RULES (MANDATORY):

  1. **PACK FREE (Plug & Play)**:
     - IGNORE user description completely.
     - Generate EXACTLY 10 real, fully functional commands with Neon/Violet design (#a855f7).
     - The code MUST be production-ready, not stubs.
     - ADMIN: 
       - /clear: Logic for bulkDelete (up to 100 messages).
       - /kick: Logic to kick a member with a reason.
       - /ban: Logic to ban a member with a reason.
       - /slowmode: Logic to set channel rate limit.
     - INFOS:
       - /userinfo: Embed with user avatar, join date, roles, etc.
       - /serverinfo: Embed with server name, owner, member count, creation date, etc.
       - /avatar: Embed showing the target user's avatar.
     - SYSTEM:
       - /ping: Returns bot latency and API latency.
       - /help: List all 10 commands with descriptions in a beautiful embed.
       - /botinfo: Information about the bot (version, library, uptime).
     - UPSELL/MARKETING:
       - If the user requests /ticket or /music, the bot MUST respond with a Neon Violet Embed explaining: "🔒 Cette fonction est réservée aux utilisateurs du Pack EXTRA. Améliorez votre bot dès maintenant sur https://discordbot-ai.app !"
       - If the user requests /poll or Logs, the bot MUST respond with a Neon Violet Embed explaining: "🔒 Cette fonction est réservée aux utilisateurs du Pack INITIAL. Améliorez votre bot dès maintenant sur https://discordbot-ai.app !"

  2. **PACK INITIAL**:
     - 10 FREE commands + Welcome System (Auto-embed based on user description) + Logs System (Message delete/edit monitoring) + /poll.
     - Follow user description for customization.
     - UPSELL/MARKETING:
       - If the user requests /music or /ticket, the bot MUST respond with a Neon Violet Embed explaining: "🔒 Cette fonction est réservée aux utilisateurs du Pack EXTRA. Améliorez votre bot dès maintenant sur https://discordbot-ai.app !"
       - If the user requests ECONOMY, the bot MUST respond with a Neon Violet Embed explaining: "🔒 Le système d'économie est réservé au Pack SUR MESURE. Contactez-nous sur https://discordbot-ai.app !"

  3. **PACK EXTRA (Full Power)**:
     - Pack INITIAL + Full Music System + TICKET MODAL SYSTEM.
     - /setup-ticket: Creates a button. On click, opens a Modal with: Title, Description, BG Image URL, Discord Category ID.

  4. **PACK SUR MESURE**:
     - All features allowed, including ECONOMY system (only allowed in this pack).

  ### TECHNICAL RULES:
  - Use "latest" for all library versions in package.json.
  - JavaScript: package.json start script MUST be "node deploy-commands.js && node index.js".
  - JavaScript: MUST include deploy-commands.js logic in the "main" or as a separate instruction.
  - TOKEN SECURITY: Hardcode the token directly in the login/run method. Do NOT use process.env or os.getenv.
  - NO .ENV: Do not mention or use .env files. The token must be written directly in the code.
  - ALL responses MUST use EmbedBuilder (JS) or Embeds (Py) with a Neon/Futuristic style.
  - PRIMARY COLOR: #a855f7.
  - Structure: The "commands" field in JSON should contain the code for the commands file.

  ${token ? `IMPORTANT: Hardcode the following token directly in the code: ${token}` : 'Use a placeholder "VOTRE_TOKEN_ICI" for the token in the code.'}
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
