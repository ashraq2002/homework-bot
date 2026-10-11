const { ADMIN_ID, TASKS_CHANNEL_ID } = require('../config/env');
const db = require('../database/storage');

const adminState = {};

function setupAdminHandlers(bot) {
  const isAdmin = (ctx) => {
    const userId = ctx.from ? Number(ctx.from.id) : 0;
    return userId === Number(ADMIN_ID);
  };

  async function updateMessageStatus(ctx, newStatusText) {
    try {
      const msg = ctx.callbackQuery.message;
      if (msg.caption !== undefined) {
        const updatedCaption = `${msg.caption}\n\n${newStatusText}`;
        await ctx.editMessageCaption(updatedCaption, { parse_mode: 'HTML' });
      } else if (msg.text !== undefined) {
        const updatedText = `${msg.text}\n\n${newStatusText}`;
        await ctx.editMessageText(updatedText, { parse_mode: 'HTML' });
      }
    } catch (err) {
      console.error('Error updating status in channel:', err.message);
    }
  }

  // پنل ادمین
  const handleAdminPanel = async (ctx) => {
    if (!isAdmin(ctx)) return ctx.reply('⛔ شما دسترسی به پنل ادمین ندارید.');
    return ctx.reply('👨‍🏫 پنل مدیریت استاد:', {
      reply_markup: {
        inline_keyboard: [
          [{ text: '📢 ارسال پیام همگانی به همه', callback_data: 'admin_broadcast_start' }],
          [{ text: '➕ ایجاد و ارسال تسک جدید', callback_data: 'admin_create_task' }],
          [{ text: '⏳ تمدید مهلت تسک (عمومی / فردی)', callback_data: 'admin_extend_menu' }],
          [{ text: '🗑 حذف تسک', callback_data: 'admin_delete_task_menu' }],
          [{ text: '👥 لیست محصلین و وضعیت تسک‌ها', callback_data: 'admin_students_report' }],
          [{ text: '📊 آمار کلی', callback_data: 'admin_general_stats' }]
        ]
      }
    });
  };

  bot.command('admin', handleAdminPanel);

  // شروع ارسال پیام همگانی
  const handleStartBroadcast = async (ctx) => {
    if (!isAdmin(ctx)) return;
    adminState[ADMIN_ID] = { step: 'WAITING_BROADCAST_MESSAGE' };
    ctx.reply(
      '📢 <b>ارسال پیام همگانی به تمام محصلین:</b>\n\n' +
      'لطفاً متن پیام مورد نظر خود را بنویسید (یا لغو با ارسال دستور /cancel):',
      { parse_mode: 'HTML' }
    );
  };

  bot.command('broadcast', handleStartBroadcast);
  bot.action('admin_broadcast_start', async (ctx) => {
    await ctx.answerCbQuery();
    await handleStartBroadcast(ctx);
  });

  // دستور لغو عملیات جاری
  bot.command('cancel', async (ctx) => {
    if (!isAdmin(ctx)) return;
    if (adminState[ADMIN_ID]) {
      delete adminState[ADMIN_ID];
      return ctx.reply('🚫 عملیات جاری لغو شد.');
    }
    ctx.reply('هیچ عملیاتی در جریان نیست.');
  });

  // ۱. ایجاد تسک جدید
  const handleCreateTask = async (ctx) => {
    if (!isAdmin(ctx)) return;
    adminState[ADMIN_ID] = { step: 'WAITING_TITLE' };
    ctx.reply('📌 لطفاً عنوان تسک را بنویسید (مثال: تمرین فرم لاگین):');
  };

  bot.command('newtask', handleCreateTask);
  bot.action('admin_create_task', async (ctx) => {
    await ctx.answerCbQuery();
    await handleCreateTask(ctx);
  });

  // ۲. منوی تمدید مهلت
  const handleExtendMenu = async (ctx) => {
    if (!isAdmin(ctx)) return;
    const data = db.readDB();
    if (!data.tasks || !data.tasks.length) {
      return ctx.reply('در حال حاضر هیچ تسکی تعریف نشده است.');
    }

    const buttons = data.tasks.map((task) => [
      { text: `⏳ تسک ${task.number}: ${task.title}`, callback_data: `extend_task_${task.number}` }
    ]);

    ctx.reply('⏳ تسکی که مایلید مهلت آن تمدید شود را انتخاب کنید:', {
      reply_markup: { inline_keyboard: buttons }
    });
  };

  bot.command('extend', handleExtendMenu);
  bot.action('admin_extend_menu', async (ctx) => {
    await ctx.answerCbQuery();
    await handleExtendMenu(ctx);
  });

  bot.action(/^extend_task_(\d+)$/, async (ctx) => {
    if (!isAdmin(ctx)) return;
    await ctx.answerCbQuery();
    const taskNumber = ctx.match[1];

    ctx.reply(`مهلت تسک شماره ${taskNumber} برای چه کسانی تمدید شود؟`, {
      reply_markup: {
        inline_keyboard: [
          [{ text: '🌐 تمدید برای همه محصلین', callback_data: `ext_target_all_${taskNumber}` }],
          [{ text: '👤 تمدید فقط برای یک محصل خاص', callback_data: `ext_target_single_${taskNumber}` }]
        ]
      }
    });
  });

  bot.action(/^ext_target_all_(\d+)$/, async (ctx) => {
    if (!isAdmin(ctx)) return;
    await ctx.answerCbQuery();
    const taskNumber = ctx.match[1];
    adminState[ADMIN_ID] = { step: 'WAITING_GLOBAL_EXTEND_DATE', taskNumber };
    ctx.reply(`⏰ مهلت جدید تسک ${taskNumber} را بنویسید (مثال: تا دوشنبه ساعت ۱۰ شب):`);
  });

  bot.action(/^ext_target_single_(\d+)$/, async (ctx) => {
    if (!isAdmin(ctx)) return;
    await ctx.answerCbQuery();
    const taskNumber = ctx.match[1];
    adminState[ADMIN_ID] = { step: 'WAITING_STUDENT_ID_FOR_EXTEND', taskNumber };
    ctx.reply('👤 لطفاً شناسه عددی محصل (Student ID) را بفرستید:', { parse_mode: 'HTML' });
  });

  // ۳. حذف تسک
  const handleDeleteTaskMenu = async (ctx) => {
    if (!isAdmin(ctx)) return;
    const data = db.readDB();
    if (!data.tasks || !data.tasks.length) {
      return ctx.reply('در حال حاضر هیچ تسکی برای حذف وجود ندارد.');
    }

    const buttons = data.tasks.map((task) => [
      { text: `❌ حذف تسک ${task.number}: ${task.title}`, callback_data: `delete_task_${task.number}` }
    ]);

    ctx.reply('🗑 لطفاً تسکی را که مایلید حذف شود انتخاب کنید:', {
      reply_markup: { inline_keyboard: buttons }
    });
  };

  bot.command('deletetask', handleDeleteTaskMenu);
  bot.action('admin_delete_task_menu', async (ctx) => {
    await ctx.answerCbQuery();
    await handleDeleteTaskMenu(ctx);
  });

  bot.action(/^delete_task_(\d+)$/, async (ctx) => {
    if (!isAdmin(ctx)) return;
    await ctx.answerCbQuery();
    const taskNumber = ctx.match[1];
    db.deleteTask(taskNumber);
    ctx.reply(`✅ تسک شماره ${taskNumber} حذف شد.`);
  });

  // ۴. آمار کلی
  const handleStats = async (ctx) => {
    if (!isAdmin(ctx)) return;
    const data = db.readDB();
    ctx.reply(
      `📊 <b>آمار کلی سیستم:</b>\n\n` +
      `👥 تعداد محصلین: ${data.users.length}\n` +
      `📚 کل تسک‌ها: ${data.tasks.length}\n` +
      `📥 کل تحویل‌ها: ${data.submissions.length}`,
      { parse_mode: 'HTML' }
    );
  };
  bot.command('stats', handleStats);
  bot.action('admin_general_stats', async (ctx) => {
    await ctx.answerCbQuery();
    await handleStats(ctx);
  });

  // ۵. لیست محصلین
  const handleStudentsReport = async (ctx) => {
    if (!isAdmin(ctx)) return;
    const report = db.getStudentsReport();

    if (!report.length) {
      return ctx.reply('هنوز هیچ محصلی در بات ثبت‌نام نکرده است.');
    }

    let message = '📋 <b>لیست محصلین و وضعیت تسک‌ها:</b>\n\n';
    report.forEach((student, index) => {
      const safeName = (student.name || 'نامشخص').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      const doneListText = student.approvedTasks && student.approvedTasks.length > 0
        ? student.approvedTasks.map((num) => `تسک ${num}`).join('، ')
        : 'هیچ تسکی تکمیل نشده';

      message += `🔹 ${index + 1}. <b>${safeName}</b> (${student.username})\n`;
      message += `   🆔 شناسه: <code>${student.id}</code>\n`;
      message += `   ✅ <b>تسک‌های تأییدشده:</b> [ ${doneListText} ]\n`;
      message += `   📈 مجموع تکمیل: ${student.approvedCount} از ${student.totalTasks}\n`;
      message += `   ⏳ در انتظار بررسی: ${student.pendingCount}\n`;
      message += `   ⚠️ نیازمند اصلاح: ${student.needsEditCount}\n`;
      message += `   ──────────────────────────\n`;
    });

    if (message.length > 4000) {
      const chunks = message.match(/[\s\S]{1,4000}/g);
      for (const chunk of chunks) {
        await ctx.reply(chunk, { parse_mode: 'HTML' });
      }
    } else {
      await ctx.reply(message, { parse_mode: 'HTML' });
    }
  };

  bot.command('students', handleStudentsReport);
  bot.action('admin_students_report', async (ctx) => {
    await ctx.answerCbQuery();
    await handleStudentsReport(ctx);
  });

  // ۶. دریافت پیام‌های متنی در پیوی ادمین
  bot.on('text', async (ctx, next) => {
    if (ctx.chat.type !== 'private' || !isAdmin(ctx) || !adminState[ADMIN_ID]) {
      return next();
    }

    const state = adminState[ADMIN_ID];

    // پردازش ارسال پیام همگانی (Broadcast)
    if (state.step === 'WAITING_BROADCAST_MESSAGE') {
      const broadcastText = ctx.message.text;
      const formattedNotice = `📢 <b>اطلاعیه استاد:</b>\n\n${broadcastText}`;

      const data = db.readDB();
      const users = data.users || [];
      let successCount = 0;

      for (const user of users) {
        try {
          await bot.telegram.sendMessage(user.id, formattedNotice, { parse_mode: 'HTML' });
          successCount++;
        } catch (e) {
          // خطاهای بلاک کردن بات نادیده گرفته می‌شوند
        }
      }

      delete adminState[ADMIN_ID];
      return ctx.reply(`✅ پیام همگانی با موفقیت برای ${successCount} محصل ارسال شد.`);
    }

    // ایجاد تسک
    if (state.step === 'WAITING_TITLE') {
      state.title = ctx.message.text;
      state.step = 'WAITING_DESCRIPTION';
      return ctx.reply('📝 توضیحات کامل تسک را بنویسید:');
    }

    if (state.step === 'WAITING_DESCRIPTION') {
      state.description = ctx.message.text;
      state.step = 'WAITING_DEADLINE';
      return ctx.reply(
        '⏰ مهلت ارسال (Deadline) تسک را مشخص کنید (مثلاً: تا پنج‌شنبه ساعت ۱۲ شب):\n' +
        'اگر مهلتی ندارد کلمه "ندارد" را بفرستید:'
      );
    }

    if (state.step === 'WAITING_DEADLINE') {
      state.deadline = ctx.message.text === 'ندارد' ? null : ctx.message.text;
      state.step = 'WAITING_FILE';
      return ctx.reply(
        '📎 در صورت تمایل فایل یا عکس تسک را بفرستید.\nاگر فایلی ندارد، کلمه "ندارد" یا دستور /skip را بفرستید.'
      );
    }

    if (state.step === 'WAITING_FILE' && (ctx.message.text === 'ندارد' || ctx.message.text === '/skip')) {
      await finalizeTaskCreation(bot, ctx, state, null);
      delete adminState[ADMIN_ID];
      return;
    }

    // تمدید مهلت همگانی
    if (state.step === 'WAITING_GLOBAL_EXTEND_DATE') {
      const newDeadline = ctx.message.text;
      db.extendGlobalDeadline(state.taskNumber, newDeadline);

      const data = db.readDB();
      const notice =
        `📢 <b>تمدید مهلت ارسال کارخانگی!</b>\n\n` +
        `🎯 <b>تسک شماره ${state.taskNumber}</b>\n` +
        `⏳ <b>مهلت جدید:</b> ${newDeadline}`;

      for (const u of data.users) {
        try {
          await bot.telegram.sendMessage(u.id, notice, { parse_mode: 'HTML' });
        } catch (e) {}
      }

      delete adminState[ADMIN_ID];
      return ctx.reply(`✅ مهلت تسک شماره ${state.taskNumber} برای همه محصلین تمدید شد.`);
    }

    // تمدید اختصاصی برای یک دانشجو
    if (state.step === 'WAITING_STUDENT_ID_FOR_EXTEND') {
      state.targetStudentId = ctx.message.text.trim();
      state.step = 'WAITING_SINGLE_EXTEND_DATE';
      return ctx.reply(`⏰ مهلت جدید را برای محصل با شناسه <code>${state.targetStudentId}</code> بنویسید:`, {
        parse_mode: 'HTML'
      });
    }

    if (state.step === 'WAITING_SINGLE_EXTEND_DATE') {
      const newDeadline = ctx.message.text;
      db.extendStudentDeadline(state.taskNumber, state.targetStudentId, newDeadline);

      try {
        await bot.telegram.sendMessage(
          state.targetStudentId,
          `🎁 <b>مهلت اختصاصی برای شما تمدید شد!</b>\n\n` +
          `🎯 برای <b>تسک شماره ${state.taskNumber}</b> مهلت جدید ثبت شد.\n` +
          `⏳ <b>مهلت جدید:</b> ${newDeadline}`,
          { parse_mode: 'HTML' }
        );
      } catch (e) {}

      delete adminState[ADMIN_ID];
      return ctx.reply(`✅ مهلت تسک شماره ${state.taskNumber} برای محصل تمدید گردید.`);
    }

    // ثبت نمره و نظر
    if (state.step === 'WAITING_GRADE_COMMENT') {
      const input = ctx.message.text;
      let grade = '100';
      let comment = 'کار مورد تأیید است.';

      if (input.includes('|')) {
        const parts = input.split('|');
        grade = parts[0].trim();
        comment = parts[1].trim();
      } else {
        grade = input.trim();
      }

      const updated = db.updateSubmissionReview(state.submissionId, {
        status: 'approved',
        grade,
        comment
      });

      if (updated) {
        try {
          await bot.telegram.sendMessage(
            updated.studentId,
            `🎉 <b>کارخانگی شما بررسی و تأیید شد!</b>\n\n` +
            `🎯 <b>تسک شماره ${updated.taskNumber}</b>\n` +
            `💯 <b>نمره:</b> ${grade}\n` +
            `💬 <b>نظر استاد:</b>\n${comment}`,
            { parse_mode: 'HTML' }
          );
        } catch (e) {}
      }

      delete adminState[ADMIN_ID];
      return ctx.reply(`✅ نمره (${grade}) و نظر شما ثبت و برای محصل ارسال شد.`);
    }

    // ارسال دلیل نیاز به اصلاح
    if (state.step === 'WAITING_REJECT_REASON') {
      const reason = ctx.message.text;

      const updated = db.updateSubmissionReview(state.submissionId, {
        status: 'needs_edit',
        comment: reason
      });

      if (updated) {
        try {
          await bot.telegram.sendMessage(
            updated.studentId,
            `⚠️ <b>کارخانگی شما برای تسک شماره ${updated.taskNumber} نیازمند اصلاح است:</b>\n\n` +
            `🔍 <b>توضیحات و بازخورد استاد:</b>\n${reason}\n\n` +
            `لطفاً پس از اعمال تغییرات، مجدداً فایل تصحیح‌شده را ارسال کنید.`,
            { parse_mode: 'HTML' }
          );
        } catch (e) {}
      }

      delete adminState[ADMIN_ID];
      return ctx.reply('✅ توضیحات اصلاح با موفقیت به پیوی محصل فرستاده شد.');
    }

    return next();
  });

  // تأیید تسک
  bot.action(/^approve_(\w+)$/, async (ctx) => {
    if (!isAdmin(ctx)) return ctx.answerCbQuery('⛔ فقط ادمین مجاز است.');
    await ctx.answerCbQuery('لطفاً در پیوی بات نمره را وارد کنید ✍️');
    const submissionId = ctx.match[1];

    adminState[ADMIN_ID] = {
      step: 'WAITING_GRADE_COMMENT',
      submissionId
    };

    try {
      await bot.telegram.sendMessage(
        ADMIN_ID,
        `✍️ استاد گرامی، کارخانگی با کد <code>${submissionId}</code> انتخاب شد.\n\n` +
        `لطفاً <b>نمره و نظر خود</b> را ارسال کنید:\n` +
        `قالب: <code>نمره | نظر</code> (مثال: <code>95 | عالی بود</code>)\n` +
        `یا فقط نمره را بفرستید: <code>95</code>`,
        { parse_mode: 'HTML' }
      );
    } catch (err) {
      console.error('Cannot message admin PV:', err);
    }

    await updateMessageStatus(ctx, '✅ <b>وضعیت: تأیید شد (در انتظار نمره در پیوی)</b>');
  });

  // رد تسک
  bot.action(/^reject_(\w+)$/, async (ctx) => {
    if (!isAdmin(ctx)) return ctx.answerCbQuery('⛔ فقط ادمین مجاز است.');
    await ctx.answerCbQuery('لطفاً در پیوی بات دلیل اصلاح را بنویسید ⚠️');
    const submissionId = ctx.match[1];

    adminState[ADMIN_ID] = {
      step: 'WAITING_REJECT_REASON',
      submissionId
    };

    try {
      await bot.telegram.sendMessage(
        ADMIN_ID,
        `⚠️ کارخانگی با کد <code>${submissionId}</code> نیازمند اصلاح اعلام شد.\n\n` +
        `لطفاً <b>علت و راهنمایی برای دانشجو</b> را همین‌جا در پیوی تایپ و ارسال کنید تا فوراً به دست او برسد:`,
        { parse_mode: 'HTML' }
      );
    } catch (err) {
      console.error('Cannot message admin PV:', err);
    }

    await updateMessageStatus(ctx, '⚠️ <b>وضعیت: نیازمند اصلاح (در انتظار نظر در پیوی)</b>');
  });
}

// ثبت اولیه تسک و ارسال به کانال آرشیو و کاربران
async function finalizeTaskCreation(bot, ctx, state, fileData) {
  const data = db.readDB();
  const taskNumber = (data.tasks.length + 1).toString();
  const taskId = 'task_' + Date.now();

  const newTask = {
    id: taskId,
    number: taskNumber,
    title: state.title,
    description: state.description,
    deadline: state.deadline || null,
    extensions: {},
    fileId: fileData ? fileData.fileId : null,
    fileType: fileData ? fileData.type : null,
    createdAt: new Date().toISOString()
  };

  db.addTask(newTask);

  const safeTitle = (newTask.title || '').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const safeDesc = (newTask.description || '').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const deadlineText = newTask.deadline ? `\n⏳ <b>مهلت ارسال:</b> ${newTask.deadline}` : '';

  const taskCaption =
    `📢 <b>تسک جدید (#${taskNumber})</b>\n\n` +
    `📌 <b>عنوان:</b> ${safeTitle}\n\n` +
    `📝 <b>توضیحات:</b>\n${safeDesc}${deadlineText}`;

  try {
    if (fileData) {
      if (fileData.type === 'photo') {
        await bot.telegram.sendPhoto(TASKS_CHANNEL_ID, fileData.fileId, { caption: taskCaption, parse_mode: 'HTML' });
      } else {
        await bot.telegram.sendDocument(TASKS_CHANNEL_ID, fileData.fileId, { caption: taskCaption, parse_mode: 'HTML' });
      }
    } else {
      await bot.telegram.sendMessage(TASKS_CHANNEL_ID, taskCaption, { parse_mode: 'HTML' });
    }
  } catch (error) {
    console.error('❌ خطا در ارسال به کانال Task Bank:', error.message);
  }

  const broadcastMarkup = {
    inline_keyboard: [
      [{ text: '🔍 مشاهده و تحویل تسک', callback_data: `view_task_${taskNumber}` }]
    ]
  };

  let sentCount = 0;
  const currentDb = db.readDB();
  const allUsers = currentDb.users || [];

  for (const user of allUsers) {
    try {
      if (fileData) {
        if (fileData.type === 'photo') {
          await bot.telegram.sendPhoto(user.id, fileData.fileId, {
            caption: taskCaption,
            parse_mode: 'HTML',
            reply_markup: broadcastMarkup
          });
        } else {
          await bot.telegram.sendDocument(user.id, fileData.fileId, {
            caption: taskCaption,
            parse_mode: 'HTML',
            reply_markup: broadcastMarkup
          });
        }
      } else {
        await bot.telegram.sendMessage(user.id, taskCaption, {
          parse_mode: 'HTML',
          reply_markup: broadcastMarkup
        });
      }
      sentCount++;
    } catch (err) {
      console.warn(`Could not broadcast task to user ${user.id}:`, err.message);
    }
  }

  ctx.reply(`✅ تسک شماره #${taskNumber} با موفقیت ثبت شد و برای ${sentCount} محصل برودکست گردید.`);
}

module.exports = { setupAdminHandlers, finalizeTaskCreation, adminState };