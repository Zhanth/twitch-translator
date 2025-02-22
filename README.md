# Twitch Translation Bot

A Twitch chat bot that automatically detects and translates messages from specific languages to Spanish. It uses both DeepL and Google Translate APIs for accurate translations.

## Features

- Automatic language detection
- Support for both DeepL and Google Translate APIs (fallback system)
- Configurable target language
- Admin commands for translation control
- Emote detection (including 7TV emotes)
- Customizable translation modes:
  - Single language mode
  - All languages mode
  - Off mode

## Setup

1. Install dependencies:
```bash
npm install
```
2. Create a `.env` file with the following variables:
````bash
# Twitch Configuration
TWITCH_CLIENT_ID=your_client_id
TWITCH_CLIENT_SECRET=your_client_secret
TWITCH_ACCESS_TOKEN=your_access_token
TWITCH_REFRESH_TOKEN=your_refresh_token
TWITCH_CHANNEL=channel_name

# Translation Configuration
DEFAULT_TRANSLATION_MODE=single
TARGET_LANGUAGE=pl
LANGUAGE_NAME=polaco

# API Keys
DEEPL_API_KEY=your_deepl_key
GOOGLE_TRANSLATE_API_KEY=your_google_key

# Bot Configuration
ADMIN_USERS=user1,user2
````

## Usage
Start the bot:
```bash
node bot.js
```

## Admin Commands

- `!translate single`: Enable translation for configured target language only.
- `!translate all`: Enable translation for all languages.
- `!translate off`: Disable translation.

## Dependencies
- @twurple/auth
- @twurple/chat
- @twurple/api
- node-fetch
- franc
- dotenv
- @google-cloud/translate