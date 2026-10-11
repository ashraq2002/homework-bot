const express = require('express');
const bot = require('./src/bot');
const { PORT } = require('./src/config/env');

const app = express();

app.get('/', (req, res) => {
  res.send('Homework Telegram Bot is online and healthy! 🚀');
});

bot.launch()
  .then(() => {
    console.log('🤖 Telegram Bot is running...');
  })
  .catch((err) => {
    console.error('❌ Bot Launch Error:', err);
  });

app.listen(PORT, () => {
  console.log(`🌐 Web server running on port ${PORT}`);
});

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));