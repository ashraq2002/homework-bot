const { Telegraf } = require('telegraf');
const { BOT_TOKEN, ADMIN_ID } = require('./config/env');
const db = require('./database/storage');
const { setupAdminHandlers } = require('./handlers/admin');
const { setupStudentHandlers } = require('./handlers/student');

const bot = new Telegraf(BOT_TOKEN);

// ۱. تنظیم منوی عمومی برای دانشجویان
bot.telegram.setMyCommands([
  { command: 'tasks', description: '📚 تمام تسک‌ها' },
  { command: 'progress', description: '📊 کارنامه و درصد پیشرفت من' },
  { command: 'done', description: '✅ تسک‌های انجام‌شده و تأییدشده' },
  { command: 'undone', description: '⏳ تسک‌های انجام‌نشده و باقی‌مانده' },
  { command: 'help', description: '📞 پشتیبانی و ارتباط با سازنده' },
  { command: 'start', description: '🔄 شروع مجدد ربات' }
]);

// ۲. منوی اختصاصی ادمین (اضافه شدن دستور broadcast)
bot.telegram.setMyCommands(
  [
    { command: 'broadcast', description: '📢 ارسال پیام همگانی به تمام محصلین' },
    { command: 'newtask', description: '➕ ایجاد و ارسال تسک جدید' },
    { command: 'extend', description: '⏳ تمدید مهلت تسک (عمومی یا فردی)' },
    { command: 'deletetask', description: '🗑 حذف تسک‌ها' },
    { command: 'students', description: '👥 لیست محصلین و وضعیت تسک‌ها' },
    { command: 'stats', description: '📊 آمار کلی سیستم' },
    { command: 'admin', description: '👨‍🏫 پنل اصلی مدیریت' }
  ],
  { scope: { type: 'chat', chat_id: ADMIN_ID } }
);

bot.start((ctx) => {
  const isUserAdmin = Number(ctx.from.id) === Number(ADMIN_ID);

  db.addUser({
    id: ctx.from.id,
    firstName: ctx.from.first_name,
    lastName: ctx.from.last_name,
    username: ctx.from.username,
    date: new Date().toISOString()
  });

  if (isUserAdmin) {
    return ctx.reply('👨‍🏫 سلام استاد! به پنل اختصاصی مدیریت خوش آمدید.', {
      reply_markup: {
        inline_keyboard: [
          [{ text: '📢 ارسال پیام همگانی به همه', callback_data: 'admin_broadcast_start' }],
          [{ text: '➕ ایجاد و ارسال تسک جدید', callback_data: 'admin_create_task' }],
          [{ text: '⏳ تمدید مهلت تسک (عمومی / فردی)', callback_data: 'admin_extend_menu' }],
          [{ text: '🗑 حذف تسک', callback_data: 'admin_delete_task_menu' }],
          [{ text: '👥 لیست محصلین و وضعیت انجام تسک‌ها', callback_data: 'admin_students_report' }],
          [{ text: '📊 آمار کلی', callback_data: 'admin_general_stats' }]
        ]
      }
    });
  }

  const replyMarkup = {
    inline_keyboard: [
      [{ text: '📚 مشاهده تمام تسک‌ها', callback_data: 'menu_tasks' }],
      [{ text: '📊 کارنامه و درصد پیشرفت من', callback_data: 'menu_progress' }],
      [
        { text: '✅ انجام‌شده‌ها', callback_data: 'menu_done' },
        { text: '⏳ تسک‌های باقی‌مانده', callback_data: 'menu_undone' }
      ],
      [{ text: '👨‍💻 پشتیبانی و ارتباط با سازنده', url: 'https://t.me/SohailEshraq' }]
    ]
  };

  ctx.reply(
    `سلام ${ctx.from.first_name || ''}! 👋\nبه سامانه مدیریت و تحویل تکالیف خوش آمدید.\n\nاز گزینه‌های زیر یا دکمه Menu برای ادامه استفاده کنید:`,
    { reply_markup: replyMarkup }
  );
});

setupAdminHandlers(bot);
setupStudentHandlers(bot);

module.exports = bot;