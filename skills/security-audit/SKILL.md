---
name: security-audit
description: تدقيق أمني شامل للتطبيقات يغطي فحص المدخلات، إدارة الأسرار، الصلاحيات، الجلسات، حماية API، OWASP Top 10، security headers، rate limiting، وCORS. استخدم عند طلب تدقيق أمني، security audit، فحص ثغرات، مراجعة أمان، security review، penetration testing prep، OWASP audit، vulnerability scan، security hardening، أو عند ظهور مشاكل أمنية.
---

# التدقيق الأمني الشامل (Security Audit)

## متى تستخدم

استخدم هذه المهارة عند:

- طلب تدقيق أمني أو security review
- فحص input validation أو secrets management
- تدقيق OWASP Top 10 أو penetration testing prep
- مراجعة rate limiting أو CORS أو security headers

## تصنيف الأسباب الجذرية

صنّف كل ثغرة ضمن سبب جذري واحد:

- `injection-risk`: مدخلات غير محققة تسمح بـ SQL/Command/XSS injection
- `secret-exposure`: API keys أو passwords مكشوفة في كود أو logs
- `auth-gap`: authentication/authorization غائب أو قابل للتجاوز
- `config-exposure`: إعدادات خطرة أو security headers غائبة
- `dos-risk`: غياب rate limiting أو حماية من abuse

ابدأ بالسبب الجذري ثم وصف الثغرة.

## المرجعية في المشروع

- `server/middlewares/cors.mjs` — إعداد CORS
- `server/routes/index.mjs` — تعريف routes (فحص rate limiting وauth middleware)
- المشروع يستخدم `.env` للأسرار (`.env.example` كمرجع)
- Endpoint الخارجية حساسة: Mistral، Anthropic، Gemini، Moonshot keys

## نقطة البداية السريعة

1. شغّل `npm audit` / `pnpm audit` لفحص vulnerabilities المعروفة.
2. تحقّق من غياب secrets في الكود (`git-secrets` / `TruffleHog`).
3. فحص input validation على جميع endpoints.
4. صنّف كل ثغرة باستخدام نماذج `تصنيف الأسباب الجذرية`.
5. رتّب النتائج: 🔴 حرج، 🟡 مهم، 🟢 تحسين.

## سير العمل

### قائمة التدقيق الأساسية

### 1️⃣ فحص المدخلات (Input Validation)

#### ✅ نقاط التحقق
- [ ] **جميع المدخلات تُتحقق منها** قبل المعالجة
- [ ] **Whitelist validation** (قائمة بيضاء) بدلاً من Blacklist
- [ ] **Type checking** صارم لجميع المدخلات
- [ ] **Length limits** محددة لجميع الحقول
- [ ] **Sanitization** للمدخلات قبل الاستخدام
- [ ] **Encoding** مناسب للسياق (HTML, URL, SQL, etc.)

#### 🔴 ثغرات شائعة
```typescript
// ❌ خطر: لا يوجد validation
app.post('/search', (req, res) => {
  const query = req.body.query;
  db.query(`SELECT * FROM products WHERE name LIKE '%${query}%'`);
});

// ✅ آمن: validation + parameterized query
app.post('/search', validateRequest(searchSchema), (req, res) => {
  const query = req.validatedBody.query;
  db.query('SELECT * FROM products WHERE name LIKE ?', [`%${query}%`]);
});
```

### 2️⃣ حماية من Injection Attacks

#### SQL Injection
- [ ] **استخدام Parameterized Queries** حصراً
- [ ] **ORM/Query Builder** بدلاً من raw SQL
- [ ] **Escape user input** إذا كان raw SQL ضرورياً
- [ ] **Least privilege** لحسابات قاعدة البيانات

#### NoSQL Injection
- [ ] **Type validation** صارم للـ queries
- [ ] **تجنب $where** في MongoDB
- [ ] **Sanitize** المدخلات قبل استخدامها في queries

#### XSS (Cross-Site Scripting)
- [ ] **Escape HTML** في جميع المخرجات
- [ ] **Content Security Policy** (CSP) مُفعّل
- [ ] **HttpOnly cookies** للجلسات
- [ ] **تجنب dangerouslySetInnerHTML** في React
- [ ] **DOMPurify** للـ user-generated HTML

#### Command Injection
- [ ] **تجنب exec/eval** مع مدخلات المستخدم
- [ ] **Whitelist** للأوامر المسموحة
- [ ] **Sandboxing** للعمليات الخطرة

### 3️⃣ إدارة الأسرار (Secrets Management)

#### ✅ نقاط التحقق
- [ ] **لا توجد أسرار في الكود** (hardcoded secrets)
- [ ] **استخدام .env** لجميع الأسرار
- [ ] **.env في .gitignore**
- [ ] **.env.example** موجود بدون قيم حقيقية
- [ ] **Environment variables** في production
- [ ] **Secrets rotation** دورياً
- [ ] **Encryption at rest** للأسرار الحساسة

#### 🔴 ثغرات شائعة
```typescript
// ❌ خطر جداً: أسرار في الكود
const API_KEY = 'sk-1234567890abcdef';
const DB_PASSWORD = 'MySecretPassword123';

// ✅ آمن: استخدام environment variables
const API_KEY = process.env.API_KEY;
const DB_PASSWORD = process.env.DB_PASSWORD;

// التحقق من وجود الأسرار
if (!API_KEY || !DB_PASSWORD) {
  throw new Error('Missing required environment variables');
}
```

#### فحص الكود للأسرار
```bash
# استخدام أدوات الفحص
git secrets --scan
trufflehog git file://. --only-verified
gitleaks detect --source .
```

### 4️⃣ Authentication (المصادقة)

#### ✅ نقاط التحقق
- [ ] **كلمات مرور قوية** (min 8 chars, complexity)
- [ ] **Password hashing** (bcrypt, argon2, scrypt)
- [ ] **Salt** فريد لكل كلمة مرور
- [ ] **Multi-factor authentication** (MFA) متاح
- [ ] **Account lockout** بعد محاولات فاشلة
- [ ] **Password reset** آمن (tokens محدودة الوقت)
- [ ] **Session management** صحيح
- [ ] **JWT** مُوقّع ومُشفّر إذا استُخدم

#### 🔴 ثغرات شائعة
```typescript
// ❌ خطر جداً: كلمة مرور بدون تشفير
const user = await db.users.create({
  email,
  password: password // نص واضح!
});

// ✅ آمن: تشفير بـ bcrypt
import bcrypt from 'bcrypt';
const hashedPassword = await bcrypt.hash(password, 10);
const user = await db.users.create({
  email,
  password: hashedPassword
});
```

#### JWT Security
```typescript
// ✅ إعدادات JWT آمنة
const token = jwt.sign(
  { userId: user.id, role: user.role },
  process.env.JWT_SECRET,
  {
    expiresIn: '1h', // انتهاء قصير
    algorithm: 'HS256',
    issuer: 'your-app',
    audience: 'your-app-users'
  }
);

// تخزين آمن في cookie
res.cookie('token', token, {
  httpOnly: true, // لا يمكن الوصول من JavaScript
  secure: true, // HTTPS فقط
  sameSite: 'strict', // حماية من CSRF
  maxAge: 3600000 // ساعة واحدة
});
```

### 5️⃣ Authorization (التفويض)

#### ✅ نقاط التحقق
- [ ] **Principle of least privilege** مُطبق
- [ ] **Role-based access control** (RBAC)
- [ ] **Resource-level permissions** للبيانات الحساسة
- [ ] **Ownership checks** قبل التعديل/الحذف
- [ ] **Horizontal privilege escalation** محمي
- [ ] **Vertical privilege escalation** محمي

#### 🔴 ثغرات شائعة
```typescript
// ❌ خطر: لا يوجد ownership check
app.delete('/posts/:id', authenticate, async (req, res) => {
  await db.posts.delete(req.params.id);
  res.status(204).send();
});

// ✅ آمن: التحقق من الملكية
app.delete('/posts/:id', authenticate, async (req, res) => {
  const post = await db.posts.findById(req.params.id);
  
  if (!post) {
    return res.status(404).json({ error: 'Post not found' });
  }
  
  if (post.authorId !== req.user.id && req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Forbidden' });
  }
  
  await db.posts.delete(req.params.id);
  res.status(204).send();
});
```

### 6️⃣ Session Management

#### ✅ نقاط التحقق
- [ ] **Session IDs** عشوائية وطويلة
- [ ] **Session expiration** محدد
- [ ] **Session regeneration** بعد login
- [ ] **Logout** يُدمّر الجلسة تماماً
- [ ] **Concurrent sessions** محدودة
- [ ] **Session storage** آمن (Redis, database)

#### Session Security
```typescript
// ✅ إعدادات session آمنة
app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 1800000 // 30 دقيقة
  },
  store: new RedisStore({ client: redisClient })
}));

// إعادة توليد session بعد login
app.post('/login', async (req, res) => {
  // ... التحقق من المستخدم
  
  req.session.regenerate((err) => {
    if (err) return next(err);
    req.session.userId = user.id;
    res.json({ success: true });
  });
});
```

### 7️⃣ API Security

#### Rate Limiting
- [ ] **Global rate limit** لجميع endpoints
- [ ] **Endpoint-specific limits** للعمليات الحساسة
- [ ] **IP-based limiting**
- [ ] **User-based limiting** للمستخدمين المصادق عليهم
- [ ] **Exponential backoff** للمحاولات الفاشلة

```typescript
import rateLimit from 'express-rate-limit';

// ✅ Rate limiting شامل
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 دقيقة
  max: 100, // 100 طلب
  message: 'Too many requests, please try again later',
  standardHeaders: true,
  legacyHeaders: false
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5, // 5 محاولات تسجيل دخول فقط
  skipSuccessfulRequests: true
});

app.use('/api/', globalLimiter);
app.use('/api/auth/', authLimiter);
```

#### CORS Configuration
- [ ] **Origins محددة** (لا تستخدم `*`)
- [ ] **Methods محددة** فقط المطلوبة
- [ ] **Credentials** مُفعّل فقط عند الحاجة
- [ ] **Preflight caching** مُعد بشكل صحيح

```typescript
// ✅ CORS آمن
import cors from 'cors';

app.use(cors({
  origin: process.env.NODE_ENV === 'production'
    ? ['https://yourdomain.com', 'https://www.yourdomain.com']
    : ['http://localhost:3000'],
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
  maxAge: 86400 // 24 ساعة
}));
```

### 8️⃣ Security Headers

#### ✅ Headers المطلوبة
- [ ] **Content-Security-Policy** (CSP)
- [ ] **X-Content-Type-Options: nosniff**
- [ ] **X-Frame-Options: DENY**
- [ ] **X-XSS-Protection: 1; mode=block**
- [ ] **Strict-Transport-Security** (HSTS)
- [ ] **Referrer-Policy**
- [ ] **Permissions-Policy**

```typescript
import helmet from 'helmet';

// ✅ استخدام Helmet لـ security headers
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:', 'https:'],
      connectSrc: ["'self'"],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"]
    }
  },
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true
  }
}));
```

### 9️⃣ File Upload Security

#### ✅ نقاط التحقق
- [ ] **File type validation** (MIME type + extension)
- [ ] **File size limits** محددة
- [ ] **Virus scanning** للملفات المرفوعة
- [ ] **Random filenames** لتجنب path traversal
- [ ] **Storage outside webroot** إذا أمكن
- [ ] **Content-Disposition** header للتنزيلات
- [ ] **No execution permissions** على مجلد الرفع

```typescript
// ✅ File upload آمن
import multer from 'multer';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'application/pdf'];
const MAX_SIZE = 5 * 1024 * 1024; // 5MB

const storage = multer.diskStorage({
  destination: 'uploads/',
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${uuidv4()}${ext}`);
  }
});

const fileFilter = (req, file, cb) => {
  if (!ALLOWED_TYPES.includes(file.mimetype)) {
    return cb(new Error('Invalid file type'), false);
  }
  cb(null, true);
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: MAX_SIZE }
});
```

### 🔟 OWASP Top 10 Coverage

#### A01:2021 – Broken Access Control
- [ ] Authorization checks في جميع endpoints
- [ ] Ownership verification للموارد
- [ ] CORS مُعد بشكل صحيح

#### A02:2021 – Cryptographic Failures
- [ ] HTTPS مُفعّل في production
- [ ] Sensitive data مُشفّرة at rest
- [ ] Strong encryption algorithms
- [ ] Proper key management

#### A03:2021 – Injection
- [ ] Parameterized queries
- [ ] Input validation
- [ ] Output encoding
- [ ] Prepared statements

#### A04:2021 – Insecure Design
- [ ] Threat modeling مُنفّذ
- [ ] Security requirements محددة
- [ ] Secure design patterns مُستخدمة

#### A05:2021 – Security Misconfiguration
- [ ] Security headers مُفعّلة
- [ ] Default credentials مُغيّرة
- [ ] Error messages لا تكشف معلومات حساسة
- [ ] Unnecessary features مُعطّلة

#### A06:2021 – Vulnerable Components
- [ ] Dependencies محدّثة
- [ ] Security advisories مُراقبة
- [ ] `npm audit` يُشغّل دورياً
- [ ] Automated dependency updates

#### A07:2021 – Authentication Failures
- [ ] Strong password policy
- [ ] MFA متاح
- [ ] Session management صحيح
- [ ] Account lockout مُفعّل

#### A08:2021 – Software and Data Integrity
- [ ] Code signing
- [ ] CI/CD pipeline آمن
- [ ] Dependency verification
- [ ] Integrity checks

#### A09:2021 – Logging & Monitoring Failures
- [ ] Security events مُسجّلة
- [ ] Log tampering محمي
- [ ] Alerting مُعد
- [ ] Log retention policy

#### A10:2021 – Server-Side Request Forgery
- [ ] URL validation
- [ ] Whitelist للـ domains المسموحة
- [ ] Network segmentation
- [ ] Disable unnecessary protocols

### مراحل سير العمل

### المرحلة 1: التحضير
1. **جمع المعلومات** عن التطبيق
2. **تحديد النطاق** (scope) للتدقيق
3. **إعداد البيئة** للاختبار

### المرحلة 2: الفحص الآلي
```bash
# Dependency vulnerabilities
npm audit
npm audit fix

# Security linting
npx eslint-plugin-security
npx @microsoft/eslint-plugin-sdl

# Secrets scanning
git secrets --scan
trufflehog git file://. --only-verified

# SAST (Static Application Security Testing)
npx snyk test
```

### المرحلة 3: الفحص اليدوي
1. **مراجعة الكود** للثغرات الشائعة
2. **فحص Authentication/Authorization**
3. **اختبار Input validation**
4. **مراجعة Session management**
5. **فحص API security**

### المرحلة 4: اختبار الاختراق
1. **SQL Injection** testing
2. **XSS** testing
3. **CSRF** testing
4. **Authentication bypass** attempts
5. **Authorization bypass** attempts

### المرحلة 5: التقرير
استخدم قالب التقرير في [security-report-template.md](security-report-template.md)

## أدوات التدقيق الأمني

### Automated Scanners
- **npm audit** - فحص dependencies
- **Snyk** - vulnerability scanning
- **OWASP ZAP** - web app scanner
- **Burp Suite** - penetration testing
- **SonarQube** - code quality & security

### SAST Tools
- **ESLint Security Plugin**
- **Semgrep**
- **CodeQL**
- **Checkmarx**

### Secrets Detection
- **git-secrets**
- **TruffleHog**
- **GitLeaks**
- **detect-secrets**

### Runtime Protection
- **Helmet.js** - security headers
- **express-rate-limit** - rate limiting
- **express-validator** - input validation
- **DOMPurify** - XSS protection

## قائمة مرجعية سريعة

قبل إطلاق التطبيق في production، تأكد من:

- [ ] ✅ جميع dependencies محدّثة وآمنة
- [ ] ✅ لا توجد أسرار في الكود
- [ ] ✅ HTTPS مُفعّل
- [ ] ✅ Authentication قوي ومُختبر
- [ ] ✅ Authorization مُطبق على جميع endpoints
- [ ] ✅ Input validation شامل
- [ ] ✅ Rate limiting مُفعّل
- [ ] ✅ Security headers مُعدّة
- [ ] ✅ CORS مُعد بشكل صحيح
- [ ] ✅ Error messages لا تكشف معلومات حساسة
- [ ] ✅ Logging & monitoring مُفعّل
- [ ] ✅ Backup & recovery plan جاهز

## قواعد التقرير

1. **Defense in Depth** — طبقات أمان متعددة
2. **Fail Securely** — الفشل بشكل آمن
3. **Least Privilege** — أقل صلاحيات ممكنة
4. **Never Trust User Input** — لا تثق بمدخلات المستخدم أبداً
5. **Security by Design** — الأمان من البداية، ليس إضافة لاحقة

## المراجع

- [references/owasp-checklist.md](references/owasp-checklist.md) - قائمة OWASP Top 10 الكاملة
- [references/examples.md](references/examples.md) - أمثلة عملية للثغرات وحلولها
- [references/security-report-template.md](references/security-report-template.md) - قالب تقرير التدقيق
