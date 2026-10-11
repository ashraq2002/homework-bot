require('dotenv').config();

module.exports = {
  BOT_TOKEN: process.env.BOT_TOKEN,
  ADMIN_ID: Number(process.env.ADMIN_ID),
  TASKS_CHANNEL_ID: process.env.TASKS_CHANNEL_ID,
  SUBMISSIONS_CHANNEL_ID: process.env.SUBMISSIONS_CHANNEL_ID,
  PORT: process.env.PORT || 3000
};