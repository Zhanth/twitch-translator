// Cargar variables de entorno desde el archivo .env
import dotenv from 'dotenv';
dotenv.config();

import fetch from 'node-fetch';
import { franc } from 'franc';
import { Translate } from '@google-cloud/translate/build/src/v2/index.js';
import { ApiClient } from '@twurple/api';
import { RefreshingAuthProvider } from '@twurple/auth';
import { ChatClient } from '@twurple/chat';

// --------------------------
// Configuración y constantes
// --------------------------

// Lista de usuarios administradores obtenida desde las variables de entorno
const ADMIN_USERS = (process.env.ADMIN_USERS || 'zhanthh').split(',');

// Modo de traducción inicial (por defecto 'polish' si no se especifica en las variables de entorno)
let translationMode = process.env.DEFAULT_TRANSLATION_MODE || 'single';
const TARGET_LANGUAGE = process.env.TARGET_LANGUAGE || 'pl';
const DEEPL_API_KEY = process.env.DEEPL_API_KEY;

// Lista de emotes de 7TV
let sevenTVEmotes = new Set();

// Obtención de los emotes de 7TV del canal
const fetch7TVEmotes = async (channelName) => {
  try {
    const response = await fetch(`https://7tv.io/v3/users/${channelName}`);
    const data = await response.json();
    if (data.emote_set?.emotes) {
      sevenTVEmotes = new Set(data.emote_set.emotes.map(emote => emote.name));
    }
  } catch (error) {
    console.error('Error fetching 7TV emotes:', error);
  }
};

// --------------------------
// Funciones auxiliares
// --------------------------

// Determina si un mensaje es un emote basado en patrones comunes o 7TV
const isEmote = (text) => {
  const commonExpressions = [
    /^[A-Z]+$/,
    /^[xX][dD]+$/i,
    /^[hH][aA]+$/,
    /^[jJ][aA]+$/,
    /^[lL][oO][lL]+$/i,
    /^[k]+[e]+[k]+$/i,
    /^[w]+$/i,
    /^\s*[;:][\'\"]*[-~]*[)(DO0PpxX]+\s*$/
  ];
  
  // Check if it's a 7TV emote
  if (sevenTVEmotes.has(text)) {
    return true;
  }

  return commonExpressions.some(pattern => pattern.test(text)) || text.length <= 3;
};

// Limpia un mensaje para la detección de idioma, eliminando caracteres no alfabéticos y espacios extra
const cleanMessageForLangDetection = (message) => {
  return message
    .replace(/\s+/g, ' ')
    .replace(/[^\p{L}\s]/gu, '') // Conserva solo letras y espacios
    .trim();
};

// --------------------------
// Funciones de traducción y detección de idioma
// --------------------------

// Detecta el idioma de un texto usando la API de DeepL
const deeplDetectLanguage = async (text) => {
  try {
    const params = new URLSearchParams({
      auth_key: DEEPL_API_KEY,
      text,
      target_lang: 'EN'
    });
    const response = await fetch(`https://api-free.deepl.com/v2/translate?${params}`);
    const data = await response.json();
    return data.translations[0].detected_source_language;
  } catch (error) {
    console.error('Error detectando idioma con DeepL:', error.message);
    return null;
  }
};

// Traduce un texto al español usando la API de DeepL
const deeplTranslate = async (text) => {
  try {
    const params = new URLSearchParams({
      auth_key: DEEPL_API_KEY,
      text,
      target_lang: 'ES',
      formality: 'less'
    });
    const response = await fetch(`https://api-free.deepl.com/v2/translate?${params}`);
    if (response.status === 456) {
      console.log('⚠️ Límite de DeepL alcanzado, se cambia a Google Translate.');
      return null;
    }
    const data = await response.json();
    return data.translations[0].text;
  } catch (error) {
    console.error('Error en DeepL:', error.message);
    return null;
  }
};

// Crea una instancia del cliente de Google Translate con la clave de API
const googleTranslate = new Translate({ 
  key: process.env.GOOGLE_TRANSLATE_API_KEY 
});

// Detecta el idioma de un texto usando Google Translate
const googleDetectLanguage = async (text) => {
  try {
    const [detection] = await googleTranslate.detect(text);
    return detection.language;
  } catch (error) {
    console.error('Error detectando idioma con Google:', error.message);
    return null;
  }
};

// Traduce un texto al español usando Google Translate
const googleTranslateText = async (text) => {
  try {
    const [translation] = await googleTranslate.translate(text, 'es');
    return translation;
  } catch (error) {
    console.error('Error en Google Translate:', error.message);
    return null;
  }
};

// --------------------------
// Función principal: inicializar el bot
// --------------------------

async function initializeBot() {
  const authProvider = new RefreshingAuthProvider(
    {
      clientId: process.env.TWITCH_CLIENT_ID,
      clientSecret: process.env.TWITCH_CLIENT_SECRET,
      onRefresh: async (userId, newTokenData) => {
        console.log('Token refrescado para el usuario:', userId);
      }
    }
  );

  await authProvider.addUserForToken({
    accessToken: process.env.TWITCH_ACCESS_TOKEN,
    refreshToken: process.env.TWITCH_REFRESH_TOKEN,
    expiresIn: 0,
    obtainmentTimestamp: 0,
    scope: ['chat:read', 'chat:edit']
  }, ['chat']);

  const apiClient = new ApiClient({ authProvider });
  
  const client = new ChatClient({ 
    authProvider,
    channels: [process.env.TWITCH_CHANNEL]
  });

  await fetch7TVEmotes(process.env.TWITCH_CHANNEL);

  client.onMessage(async (channel, user, message, msg) => {
    if (msg.userInfo.userId === client.userId) return;
    if (ADMIN_USERS.includes(user.toLowerCase()) && message.startsWith('!translate')) {
      const command = message.split(' ')[1];
      if (command === 'single') {
        translationMode = 'single';
        client.say(channel, `Traduciendo ${process.env.LANGUAGE_NAME || 'el idioma configurado'}.`);
        return;
      } else if (command === 'all') {
        translationMode = 'all';
        client.say(channel, `Traduciendo todos los idiomas.`);
        return;
      } else if (command === 'off') {
        translationMode = 'off';
        client.say(channel, `Traducciones desactivadas.`);
        return;
      }
    }

    // Si las traducciones están desactivadas, no hace nada
    if (translationMode === 'off') return;

    try {
      // Limpia el mensaje y verifica si es un emote; si lo es, lo ignora
      const cleanMessage = message.trim();
      if (isEmote(cleanMessage)) return;

      // Prepara el texto para la detección de idioma y verifica longitud mínima
      const textForLangDetection = cleanMessageForLangDetection(cleanMessage);
      if (textForLangDetection.length < 4) return;

      // Detección preliminar del idioma con franc para filtrar mensajes obvios
      const preliminaryLang = franc(textForLangDetection);
      if (preliminaryLang === 'eng' || preliminaryLang === 'spa' || preliminaryLang === 'und') {
        return;
      }

      // Intenta detectar el idioma con DeepL; si falla, usa Google Translate
      let detectedLanguage = await deeplDetectLanguage(cleanMessage);
      if (!detectedLanguage) {
        detectedLanguage = await googleDetectLanguage(cleanMessage);
      }

      // Ignora mensajes si no se detecta idioma o si son en inglés o español
      if (!detectedLanguage ||
          detectedLanguage.toLowerCase() === 'en' ||
          detectedLanguage.toLowerCase() === 'es') {
        return;
      }

      // En modo 'polish', solo traduce mensajes en polaco
      if (translationMode === 'single' && detectedLanguage.toLowerCase() !== TARGET_LANGUAGE.toLowerCase()) {
        return;
      }

      // Intenta traducir con DeepL; si falla, usa Google Translate
      let translatedText = await deeplTranslate(cleanMessage);
      if (!translatedText) {
        translatedText = await googleTranslateText(cleanMessage);
      }

      // Envía la traducción al chat si se obtuvo correctamente
      if (translatedText) {
        client.say(channel, `@${user}: ${translatedText}`);
      }
    } catch (error) {
      console.error('Error en la traducción:', error);
    }
  });

  await client.connect();
  console.log('Translation bot connected successfully');
}

// --------------------------
// Iniciar el bot
// --------------------------
initializeBot().catch(console.error);