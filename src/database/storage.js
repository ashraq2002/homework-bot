const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, '../../data.json');

function initDB() {
  if (!fs.existsSync(DB_PATH)) {
    const initialData = { users: [], tasks: [], submissions: [] };
    fs.writeFileSync(DB_PATH, JSON.stringify(initialData, null, 2));
  }
}

function readDB() {
  initDB();
  return JSON.parse(fs.readFileSync(DB_PATH, 'utf-8'));
}

function writeDB(data) {
  fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
}

function addUser(user) {
  const db = readDB();
  if (!db.users.some((u) => u.id === user.id)) {
    db.users.push(user);
    writeDB(db);
  }
}

function addTask(task) {
  const db = readDB();
  db.tasks.push({
    ...task,
    extensions: {} // نگهداری تمدیدهای فردی: { "studentId": "مهلت جدید" }
  });
  writeDB(db);
}

function deleteTask(taskNumber) {
  const db = readDB();
  db.tasks = db.tasks.filter((t) => t.number !== taskNumber);
  db.tasks.forEach((t, index) => {
    t.number = (index + 1).toString();
  });
  writeDB(db);
  return db.tasks;
}

// تمدید مهلت عمومی برای همه محصلین
function extendGlobalDeadline(taskNumber, newDeadline) {
  const db = readDB();
  const task = db.tasks.find((t) => t.number === taskNumber);
  if (task) {
    task.deadline = newDeadline;
    writeDB(db);
  }
  return task;
}

// تمدید مهلت اختصاصی برای یک محصل مشخص
function extendStudentDeadline(taskNumber, studentId, newDeadline) {
  const db = readDB();
  const task = db.tasks.find((t) => t.number === taskNumber);
  if (task) {
    if (!task.extensions) task.extensions = {};
    task.extensions[studentId.toString()] = newDeadline;
    writeDB(db);
  }
  return task;
}

// دریافت ددلاین مؤثر برای یک محصل (با اولویت تمدید فردی)
function getEffectiveDeadline(task, studentId) {
  if (!task) return null;
  if (task.extensions && task.extensions[studentId.toString()]) {
    return {
      deadline: task.extensions[studentId.toString()],
      isCustom: true
    };
  }
  return {
    deadline: task.deadline,
    isCustom: false
  };
}

function addSubmission(submission) {
  const db = readDB();
  db.submissions.push({
    ...submission,
    submittedAt: new Date().toISOString()
  });
  writeDB(db);
}

function updateSubmissionReview(submissionId, { status, grade, comment }) {
  const db = readDB();
  const sub = db.submissions.find((s) => s.id === submissionId);
  if (sub) {
    sub.status = status;
    if (grade !== undefined) sub.grade = grade;
    if (comment !== undefined) sub.comment = comment;
    writeDB(db);
  }
  return sub;
}

function getStudentsReport() {
  const db = readDB();
  const tasks = db.tasks || [];
  const submissions = db.submissions || [];
  const users = db.users || [];

  return users.map((user) => {
    const userSubmissions = submissions.filter((s) => s.studentId === user.id);
    const approvedTasks = [
      ...new Set(
        userSubmissions
          .filter((s) => s.status === 'approved')
          .map((s) => s.taskNumber)
      )
    ].sort((a, b) => Number(a) - Number(b));

    const pendingCount = userSubmissions.filter((s) => s.status === 'pending').length;
    const needsEditCount = userSubmissions.filter((s) => s.status === 'needs_edit').length;

    return {
      id: user.id,
      name: `${user.firstName || ''} ${user.lastName || ''}`.trim() || 'نامشخص',
      username: user.username ? `@${user.username}` : 'ندارد',
      totalTasks: tasks.length,
      approvedTasks,
      approvedCount: approvedTasks.length,
      pendingCount,
      needsEditCount
    };
  });
}

function getStudentProgress(studentId) {
  const db = readDB();
  const tasks = db.tasks || [];
  const submissions = (db.submissions || []).filter((s) => s.studentId === studentId);

  const doneTasks = [];
  const pendingTasks = [];
  const needsEditTasks = [];
  const unDoneTasks = [];

  tasks.forEach((task) => {
    const sub = submissions
      .filter((s) => s.taskNumber === task.number)
      .sort((a, b) => (b.submittedAt || '').localeCompare(a.submittedAt || ''))[0];

    const deadlineInfo = getEffectiveDeadline(task, studentId);

    if (!sub) {
      unDoneTasks.push({ ...task, activeDeadline: deadlineInfo });
    } else if (sub.status === 'approved') {
      doneTasks.push({ ...task, grade: sub.grade, comment: sub.comment });
    } else if (sub.status === 'needs_edit') {
      needsEditTasks.push({ ...task, comment: sub.comment, activeDeadline: deadlineInfo });
    } else {
      pendingTasks.push(task);
    }
  });

  return {
    totalTasks: tasks.length,
    doneTasks,
    pendingTasks,
    needsEditTasks,
    unDoneTasks
  };
}

module.exports = {
  readDB,
  addUser,
  addTask,
  deleteTask,
  extendGlobalDeadline,
  extendStudentDeadline,
  getEffectiveDeadline,
  addSubmission,
  updateSubmissionReview,
  getStudentsReport,
  getStudentProgress
};