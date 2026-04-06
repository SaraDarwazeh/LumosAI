const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const BACKEND_BASE_URL = process.env.BACKEND_BASE_URL || 'http://localhost:3000';
const AUTH_PROVIDER = process.env.AUTH_PROVIDER || 'email';
const FIREBASE_TEST_EMAIL = process.env.FIREBASE_TEST_EMAIL || '';
const FIREBASE_TEST_PASSWORD = process.env.FIREBASE_TEST_PASSWORD || '';
const FIREBASE_TEST_EMAIL_2 = process.env.FIREBASE_TEST_EMAIL_2 || '';
const FIREBASE_TEST_PASSWORD_2 = process.env.FIREBASE_TEST_PASSWORD_2 || '';

const firebaseConfig = {
  apiKey: 'AIzaSyBTR9GyhXlbc_2Tv8xrvK62lApZp-nqWR8',
  authDomain: 'lumos-aed1b.firebaseapp.com',
  projectId: 'lumos-aed1b',
  storageBucket: 'lumos-aed1b.firebasestorage.app',
  messagingSenderId: '274865460804',
  appId: '1:274865460804:web:23567d70f3d77f92920e11',
  measurementId: 'G-BCSCFL3Q83',
};

const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
  yellow: '\x1b[33m',
};

function logPass(message) {
  console.log(`${colors.green}[PASS]${colors.reset} ${message}`);
}

function logFail(message) {
  console.error(`${colors.red}[FAIL]${colors.reset} ${message}`);
}

function logInfo(message) {
  console.log(`${colors.cyan}[INFO]${colors.reset} ${message}`);
}

function logWarn(message) {
  console.log(`${colors.yellow}[WARN]${colors.reset} ${message}`);
}

function assertCondition(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function loadEnvFile() {
  const envPath = path.join(process.cwd(), '.env');
  if (!fs.existsSync(envPath)) {
    return {};
  }

  const envContent = fs.readFileSync(envPath, 'utf8');
  const env = {};

  for (const line of envContent.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }

    const separatorIndex = trimmed.indexOf('=');
    if (separatorIndex === -1) {
      continue;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    const value = trimmed.slice(separatorIndex + 1).trim();
    env[key] = value;
  }

  return env;
}

async function getFetch() {
  if (typeof fetch === 'function') {
    return fetch;
  }

  const nodeFetch = await import('node-fetch');
  return nodeFetch.default;
}

async function createFirebaseAuth() {
  const { initializeApp, getApps } = await import('firebase/app');
  const {
    getAuth,
    signInWithEmailAndPassword,
    signOut,
  } = await import('firebase/auth');

  const app = getApps().length > 0 ? getApps()[0] : initializeApp(firebaseConfig);
  const auth = getAuth(app);

  return {
    auth,
    signInWithEmailAndPassword,
    signOut,
  };
}

async function signInWithEmail(authBundle, email, password) {
  assertCondition(email, 'Missing FIREBASE_TEST_EMAIL.');
  assertCondition(password, 'Missing FIREBASE_TEST_PASSWORD.');

  const credential = await authBundle.signInWithEmailAndPassword(
    authBundle.auth,
    email,
    password,
  );

  return credential.user;
}

async function authenticateUser(label, email, password) {
  if (AUTH_PROVIDER !== 'email') {
    throw new Error(
      'This headless Node script supports email/password auth only. Google popup login is not available without a browser.',
    );
  }

  const authBundle = await createFirebaseAuth();
  const user = await signInWithEmail(authBundle, email, password);
  logPass(`${label} login`);

  const idToken = await user.getIdToken();
  assertCondition(typeof idToken === 'string' && idToken.length > 0, 'Failed to retrieve Firebase ID token.');
  logPass(`${label} token received`);

  await authBundle.signOut(authBundle.auth);

  return {
    email: user.email,
    firebaseUid: user.uid,
    idToken,
  };
}

async function backendRequest(fetchImpl, method, pathName, token, body) {
  const response = await fetchImpl(`${BACKEND_BASE_URL}${pathName}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const text = await response.text();
  let payload;

  try {
    payload = JSON.parse(text);
  } catch {
    payload = text;
  }

  return {
    status: response.status,
    payload,
  };
}

function assertBackendSuccess(response, expectedStatus, label) {
  assertCondition(response.status === expectedStatus, `${label} failed with status ${response.status}: ${JSON.stringify(response.payload)}`);
  assertCondition(response.payload && typeof response.payload === 'object', `${label} returned a non-JSON payload.`);
}

function assertApiSuccessShape(payload, label) {
  assertCondition(payload.success === true, `${label} did not return success=true.`);
  assertCondition(Object.prototype.hasOwnProperty.call(payload, 'data'), `${label} response is missing data.`);
}

function verifyUserExistsInDb(firebaseUid, email) {
  const env = loadEnvFile();
  const postgresUser = env.POSTGRES_USER || 'lumus_user';
  const postgresDb = env.POSTGRES_DB || 'lumus';
  const query = `SELECT id, email, firebase_uid FROM users WHERE firebase_uid = '${firebaseUid}';`;

  const result = spawnSync(
    'docker',
    [
      'compose',
      'exec',
      '-T',
      'postgres',
      'psql',
      '-U',
      postgresUser,
      '-d',
      postgresDb,
      '-tAc',
      query,
    ],
    {
      cwd: process.cwd(),
      encoding: 'utf8',
    },
  );

  assertCondition(result.status === 0, `Failed to query Postgres for user verification: ${result.stderr || result.stdout}`);

  const row = result.stdout.trim();
  assertCondition(row.length > 0, `User with firebase_uid "${firebaseUid}" was not found in PostgreSQL.`);

  const [id, storedEmail, storedFirebaseUid] = row.split('|').map((value) => value.trim());
  assertCondition(id, 'Verified DB row is missing a user id.');
  assertCondition(storedFirebaseUid === firebaseUid, 'Stored firebase_uid does not match the authenticated user.');
  if (email) {
    assertCondition(storedEmail === email, 'Stored user email does not match the authenticated email.');
  }

  logPass('user created automatically in DB');
  return {
    id,
    email: storedEmail,
    firebaseUid: storedFirebaseUid,
  };
}

async function verifyAuthenticatedRead(fetchImpl, token) {
  const response = await backendRequest(fetchImpl, 'GET', '/tasks', token);
  assertCondition(response.status !== 401, `Backend still returned 401 for authenticated request: ${JSON.stringify(response.payload)}`);
  assertBackendSuccess(response, 200, 'Authenticated GET /tasks');
  assertApiSuccessShape(response.payload, 'Authenticated GET /tasks');
  assertCondition(Array.isArray(response.payload.data), 'GET /tasks did not return a list.');
  logPass('backend auth success');
  return response.payload.data;
}

async function createTask(fetchImpl, token, title) {
  const response = await backendRequest(fetchImpl, 'POST', '/tasks', token, {
    title,
  });

  assertBackendSuccess(response, 201, 'POST /tasks');
  assertApiSuccessShape(response.payload, 'POST /tasks');
  assertCondition(response.payload.data && response.payload.data.id, 'Created task is missing an id.');
  logPass('task created');
  return response.payload.data;
}

async function fetchTasks(fetchImpl, token, label) {
  const response = await backendRequest(fetchImpl, 'GET', '/tasks', token);
  assertBackendSuccess(response, 200, 'GET /tasks');
  assertApiSuccessShape(response.payload, 'GET /tasks');
  assertCondition(Array.isArray(response.payload.data), 'GET /tasks did not return an array.');
  logPass(label);
  return response.payload.data;
}

function assertTaskVisible(tasks, taskId, title) {
  const task = tasks.find((item) => item.id === taskId);
  assertCondition(Boolean(task), `Task "${taskId}" was not returned by GET /tasks.`);
  assertCondition(task.title === title, `Task title mismatch. Expected "${title}", got "${task.title}".`);
}

async function runPrimaryFlow(fetchImpl) {
  const authUser = await authenticateUser('primary', FIREBASE_TEST_EMAIL, FIREBASE_TEST_PASSWORD);
  verifyUserExistsInDb(authUser.firebaseUid, authUser.email);

  await verifyAuthenticatedRead(fetchImpl, authUser.idToken);

  const taskTitle = `Test Task from Auth Script ${Date.now()}`;
  const createdTask = await createTask(fetchImpl, authUser.idToken, taskTitle);
  const tasks = await fetchTasks(fetchImpl, authUser.idToken, 'task retrieval');
  assertTaskVisible(tasks, createdTask.id, taskTitle);

  return {
    authUser,
    createdTask,
  };
}

async function runMultiUserFlow(fetchImpl, primaryTaskId) {
  if (!FIREBASE_TEST_EMAIL_2 || !FIREBASE_TEST_PASSWORD_2) {
    logInfo('Skipping multi-user isolation test because second account credentials were not provided.');
    return;
  }

  const secondUser = await authenticateUser('secondary', FIREBASE_TEST_EMAIL_2, FIREBASE_TEST_PASSWORD_2);
  verifyUserExistsInDb(secondUser.firebaseUid, secondUser.email);

  const tasks = await fetchTasks(fetchImpl, secondUser.idToken, 'secondary task retrieval');
  const leakedTask = tasks.find((task) => task.id === primaryTaskId);
  assertCondition(!leakedTask, 'Primary user task leaked into secondary user scope.');
  logPass('multi-user isolation');
}

async function main() {
  try {
    const fetchImpl = await getFetch();
    logInfo(`Using backend ${BACKEND_BASE_URL}`);

    const { createdTask } = await runPrimaryFlow(fetchImpl);
    await runMultiUserFlow(fetchImpl, createdTask.id);
  } catch (error) {
    logFail(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

main();
