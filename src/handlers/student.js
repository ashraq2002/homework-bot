const { SUBMISSIONS_CHANNEL_ID, ADMIN_ID } = require('../config/env');
const db = require('../database/storage');
const { adminState, finalizeTaskCreation } = require('./admin');

const studentSessions = {};

function setupStudentHandlers(bot) {
  // ۱. لیست تمام تسک‌ها
  const handleTasksList = async (ctx) => {
    const data = db.readDB();
    if (!data.tasks || !data.tasks.length) {
      return ctx.reply('در حال حاضر هیچ تسکی تعریف نشده است.');
    }

    const buttons = data.tasks.map((task) => [
      { text: `📌 تسک ${task.number}: ${task.title}`, callback_data: `view_task_${task.number}` }
    ]);

    ctx.reply('📚 لطفاً تسک مورد نظر خود را برای مشاهده جزئیات انتخاب کنید:', {
      reply_markup: { inline_keyboard: buttons }
    });
  };

  bot.command('tasks', handleTasksList);
  bot.action('menu_tasks', async (ctx) => {
    await ctx.answerCbQuery();
    await handleTasksList(ctx);
  });

  // ۲. کارنامه و وضعیت پیشرفت
  const handleProgress = async (ctx) => {
    const p = db.getStudentProgress(ctx.from.id);
    const percent = p.totalTasks > 0 ? Math.round((p.doneTasks.length / p.totalTasks) * 100) : 0;

    let message =
      `📊 <b>گزارش کارنامه و پیشرفت شما:</b>\n\n` +
      `📈 <b>پیشرفت کلی:</b> ${percent}%\n` +
      `📚 کل تسک‌ها: ${p.totalTasks}\n` +
      `✅ تأیید شده: ${p.doneTasks.length}\n` +
      `⏳ در انتظار بررسی استاد: ${p.pendingTasks.length}\n` +
      `⚠️ نیازمند ویرایش: ${p.needsEditTasks.length}\n` +
      `❌ انجام‌نشده: ${p.unDoneTasks.length}\n\n`;

    if (p.doneTasks.length > 0) {
      message += `🏆 <b>نمرات کسب‌شده:</b>\n`;
      p.doneTasks.forEach((t) => {
        message += `• تسک ${t.number}: نمره <b>${t.grade || 'ثبت‌نشده'}</b> ${t.comment ? `(نظر: <i>${t.comment}</i>)` : ''}\n`;
      });
    }

    await ctx.reply(message, { parse_mode: 'HTML' });
  };

  bot.command('progress', handleProgress);
  bot.action('menu_progress', async (ctx) => {
    await ctx.answerCbQuery();
    await handleProgress(ctx);
  });

  // ۳. تسک‌های تکمیل‌شده
  const handleDone = async (ctx) => {
    const p = db.getStudentProgress(ctx.from.id);
    if (!p.doneTasks.length) {
      return ctx.reply('شما هنوز هیچ تسک تأییدشده‌ای ندارید.');
    }

    let text = '✅ <b>تسک‌های تکمیل و تأییدشده:</b>\n\n';
    p.doneTasks.forEach((t) => {
      text += `✔ تسک شماره ${t.number}: <b>${t.title}</b> | نمره: <b>${t.grade || '100'}</b>\n`;
    });
    await ctx.reply(text, { parse_mode: 'HTML' });
  };

  bot.command('done', handleDone);
  bot.action('menu_done', async (ctx) => {
    await ctx.answerCbQuery();
    await handleDone(ctx);
  });

  // ۴. تسک‌های باقی‌مانده
  const handleUnDone = async (ctx) => {
    const p = db.getStudentProgress(ctx.from.id);
    if (!p.unDoneTasks.length) {
      return ctx.reply('🎉 آفرین! شما تمامی تسک‌های کلاس را با موفقیت تحویل داده‌اید.');
    }

    const buttons = p.unDoneTasks.map((t) => [
      { text: `📝 شروع تسک ${t.number}: ${t.title}`, callback_data: `view_task_${t.number}` }
    ]);

    await ctx.reply('⏳ <b>تسک‌های باقی‌مانده:</b>\nروی تسک مورد نظر کلیک کنید:', {
      parse_mode: 'HTML',
      reply_markup: { inline_keyboard: buttons }
    });
  };

  bot.command('undone', handleUnDone);
  bot.action('menu_undone', async (ctx) => {
    await ctx.answerCbQuery();
    await handleUnDone(ctx);
  });

  // ۵. مشاهده جزئیات تسک و ددلاین اختصاصی
  bot.action(/^view_task_(\d+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    const taskNumber = ctx.match[1];
    const data = db.readDB();
    const task = data.tasks.find((t) => t.number === taskNumber);

    if (!task) {
      return ctx.reply('❌ تسک مورد نظر یافت نشد.');
    }

    const safeTitle = task.title.replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const safeDesc = task.description.replace(/</g, '&lt;').replace(/>/g, '&gt;');

    const effectiveDeadline = db.getEffectiveDeadline(task, ctx.from.id);
    let deadlineText = '';
    if (effectiveDeadline && effectiveDeadline.deadline) {
      deadlineText = effectiveDeadline.isCustom
        ? `\n⏳ <b>مهلت تمدیدشده اختصاصی برای شما:</b> ${effectiveDeadline.deadline}\n`
        : `\n⏳ <b>مهلت ارسال:</b> ${effectiveDeadline.deadline}\n`;
    }

    const text =
      `📋 <b>جزئیات تسک شماره ${task.number}</b>\n\n` +
      `📌 <b>عنوان:</b> ${safeTitle}\n\n` +
      `📝 <b>توضیحات:</b>\n${safeDesc}\n` +
      `${deadlineText}\n` +
      `👇 برای تحویل فایل‌ها روی دکمه زیر کلیک کنید:`;

    const replyMarkup = {
      inline_keyboard: [
        [{ text: `📤 تحویل کارخانگی تسک ${task.number}`, callback_data: `submit_task_${task.number}` }]
      ]
    };

    if (task.fileId) {
      if (task.fileType === 'photo') {
        await ctx.replyWithPhoto(task.fileId, { caption: text, parse_mode: 'HTML', reply_markup: replyMarkup });
      } else {
        await ctx.replyWithDocument(task.fileId, { caption: text, parse_mode: 'HTML', reply_markup: replyMarkup });
      }
    } else {
      await ctx.reply(text, { parse_mode: 'HTML', reply_markup: replyMarkup });
    }
  });

  // ۶. آماده‌سازی نشست تحویل
  bot.action(/^submit_task_(\d+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    const taskNumber = ctx.match[1];

    const replyMarkup = {
      inline_keyboard: [
        [{ text: '✅ ثبت نهایی (0 فایل) و ارسال برای استاد', callback_data: 'finalize_submission' }]
      ]
    };

    const sent = await ctx.reply(
      `📤 شما در حال ارسال کارخانگی برای <b>تسک شماره ${taskNumber}</b> هستید.\n\n` +
      `📥 <b>فایل‌های دریافت شده:</b> 0 عدد\n\n` +
      `📌 می‌توانید عکس‌ها، فایل پروژه (.ZIP یا .RAR) یا کدها را بفرستید. سپس دکمه ثبت نهایی را بزنید:`,
      { parse_mode: 'HTML', reply_markup: replyMarkup }
    );

    studentSessions[ctx.from.id] = {
      taskNumber: taskNumber,
      files: [],
      messageId: sent.message_id,
      debounceTimer: null
    };
  });

  // ۷. دریافت فایل‌ها و آپدیت تک‌پیام
  bot.on(['document', 'photo'], async (ctx) => {
    const isPhoto = Boolean(ctx.message.photo);
    const fileId = isPhoto
      ? ctx.message.photo[ctx.message.photo.length - 1].file_id
      : ctx.message.document.file_id;

    const fileType = isPhoto ? 'photo' : 'document';

    if (ctx.from.id === ADMIN_ID && adminState[ctx.from.id]?.step === 'WAITING_FILE') {
      await finalizeTaskCreation(bot, ctx, adminState[ctx.from.id], { fileId, type: fileType });
      delete adminState[ctx.from.id];
      return;
    }

    const session = studentSessions[ctx.from.id];
    if (!session) {
      return ctx.reply('⚠️ لطفاً ابتدا از منوی /tasks تسک را انتخاب کنید و سپس روی دکمه تحویل بزنید.');
    }

    session.files.push({ fileId, type: fileType });

    if (session.debounceTimer) clearTimeout(session.debounceTimer);
    session.debounceTimer = setTimeout(async () => {
      const count = session.files.length;
      const text =
        `📤 شما در حال ارسال کارخانگی برای <b>تسک شماره ${session.taskNumber}</b> هستید.\n\n` +
        `📥 <b>فایل‌های دریافت شده:</b> ${count} عدد\n\n` +
        `📌 اگر فایل دیگری دارید ارسال کنید؛ در غیر این صورت دکمه زیر را برای ثبت نهایی بزنید:`;

      const markup = {
        inline_keyboard: [
          [{ text: `✅ ثبت نهایی (${count} فایل) و ارسال برای استاد`, callback_data: 'finalize_submission' }]
        ]
      };

      try {
        await bot.telegram.editMessageText(ctx.chat.id, session.messageId, undefined, text, {
          parse_mode: 'HTML',
          reply_markup: markup
        });
      } catch (e) {}
    }, 700);
  });

  // ۸. ارسال نهایی فایل‌ها به کانال Submissions
  bot.action('finalize_submission', async (ctx) => {
    await ctx.answerCbQuery();
    const session = studentSessions[ctx.from.id];

    if (!session || !session.files.length) {
      return ctx.reply('❌ فایلی برای ارسال یافت نشد! لطفاً حداقل یک عکس یا فایل ZIP بفرستید.');
    }

    const { taskNumber, files, messageId } = session;
    const submissionId = 'sub_' + Date.now();
    const student = ctx.from;
    const studentName = ((student.first_name || '') + ' ' + (student.last_name || '')).trim() || 'نامشخص';
    const studentUsername = student.username ? `@${student.username}` : 'ندارد';
    const safeStudentName = studentName.replace(/</g, '&lt;').replace(/>/g, '&gt;');

    if (messageId) {
      try {
        await ctx.telegram.editMessageReplyMarkup(ctx.chat.id, messageId, undefined, { inline_keyboard: [] });
      } catch (e) {}
    }

    db.addSubmission({
      id: submissionId,
      taskNumber: taskNumber,
      studentId: student.id,
      studentName: studentName,
      files: files,
      status: 'pending'
    });

    const caption =
      `📥 <b>کارخانگی جدید دریافتی</b>\n\n` +
      `🎯 <b>تسک:</b> شماره ${taskNumber}\n` +
      `👤 <b>محصل:</b> ${safeStudentName} (${studentUsername})\n` +
      `🆔 <b>شناسه:</b> <code>${student.id}</code>\n` +
      `📦 <b>تعداد پیوست‌ها:</b> ${files.length}\n` +
      `🔖 <b>کد تحویل:</b> <code>${submissionId}</code>`;

    const adminMarkup = {
      inline_keyboard: [
        [
          { text: '✅ تأیید و نمره‌دهی', callback_data: `approve_${submissionId}` },
          { text: '⚠️ نیاز به اصلاح (کامنت)', callback_data: `reject_${submissionId}` }
        ]
      ]
    };

    try {
      if (files.length === 1) {
        const single = files[0];
        if (single.type === 'photo') {
          await ctx.telegram.sendPhoto(SUBMISSIONS_CHANNEL_ID, single.fileId, {
            caption,
            parse_mode: 'HTML',
            reply_markup: adminMarkup
          });
        } else {
          await ctx.telegram.sendDocument(SUBMISSIONS_CHANNEL_ID, single.fileId, {
            caption,
            parse_mode: 'HTML',
            reply_markup: adminMarkup
          });
        }
      } else {
        const mediaGroup = files.map((f, i) => ({
          type: f.type,
          media: f.fileId,
          caption: i === 0 ? caption : undefined,
          parse_mode: 'HTML'
        }));

        await ctx.telegram.sendMediaGroup(SUBMISSIONS_CHANNEL_ID, mediaGroup);

        await ctx.telegram.sendMessage(
          SUBMISSIONS_CHANNEL_ID,
          `👆 کارخانگی تسک شماره ${taskNumber} از محصل: <b>${safeStudentName}</b>`,
          {
            parse_mode: 'HTML',
            reply_markup: adminMarkup
          }
        );
      }

      ctx.reply(
        `🎉 تمام <b>${files.length}</b> فایل شما برای <b>تسک شماره ${taskNumber}</b> با موفقیت برای استاد ارسال گردید.`,
        { parse_mode: 'HTML' }
      );
    } catch (err) {
      console.error('Submission Send Error:', err);
      ctx.reply('❌ متأسفانه خطایی در ارسال فایل‌ها رخ داد.');
    }

    delete studentSessions[ctx.from.id];
  });

  // ۹. دستور پشتیبانی و راهنما
  const handleSupport = async (ctx) => {
    const supportMessage =
      `💬 <b>راهنما و پشتیبانی سامانه:</b>\n\n` +
      `اگر در فرآیند تحویل تسک، ارسال فایل‌ها یا استفاده از بات سوالی دارید، می‌توانید مستقیماً با توسعه‌دهنده در ارتباط باشید.\n\n` +
      `👤 <b>توسعه‌دهنده:</b> @SohailEshraq`;

    const supportMarkup = {
      inline_keyboard: [
        [{ text: '📨 ارسال پیام مستقیم به پشتیبانی', url: 'https://t.me/SohailEshraq' }]
      ]
    };

    await ctx.reply(supportMessage, { parse_mode: 'HTML', reply_markup: supportMarkup });
  };

  bot.command('help', handleSupport);
  bot.command('support', handleSupport);
}

module.exports = { setupStudentHandlers };